
var _ = require('lodash');
var debug = require('debug')('nock.common');

/**
 * Normalizes the request options so that it always has `host` property.
 *
 * @param  {Object} options - a parsed options object of the request
 */
var normalizeRequestOptions = function(options) {
  options.proto = options.proto || 'http';
  options.port = options.port || ((options.proto === 'http') ? 80 : 443);
  if (options.host) {
    options.hostname = options.hostname || options.host.split(':')[0];
  }
  options.host = (options.hostname || 'localhost') + ':' + options.port;

  return options;
};

/**
 * Returns true if the data contained in buffer is binary which in this case means
 * that it cannot be reconstructed from its utf8 representation.
 *
 * @param  {Object} buffer - a Buffer object
 */
var isBinaryBuffer = function(buffer) {

  if(!Buffer.isBuffer(buffer)) {
    return false;
  }

  //  Test if the buffer can be reconstructed verbatim from its utf8 encoding.
  var utfEncodedBuffer = buffer.toString('utf8');
  var reconstructedBuffer = new Buffer(utfEncodedBuffer, 'utf8');
  var compareBuffers = function(lhs, rhs) {
    if(lhs.length !== rhs.length) {
      return false;
    }

    for(var i = 0; i < lhs.length; ++i) {
      if(lhs[i] !== rhs[i]) {
        return false;
      }
    }

    return true;
  };

  //  If the buffers are *not* equal then this is a "binary buffer"
  //  meaning that it cannot be faitfully represented in utf8.
  return !compareBuffers(buffer, reconstructedBuffer);

};

/**
 * If the chunks are Buffer objects then it returns a single Buffer object with the data from all the chunks.
 * If the chunks are strings then it returns a single string value with data from all the chunks.
 *
 * @param  {Array} chunks - an array of Buffer objects or strings
 */
var mergeChunks = function(chunks) {

  if(_.isEmpty(chunks)) {
    return new Buffer(0);
  }

  //  We assume that all chunks are Buffer objects if the first is buffer object.
  var areBuffers = Buffer.isBuffer(_.first(chunks));

  if(!areBuffers) {
    //  When the chunks are not buffers we assume that they are strings.
    return chunks.join('');
  }

  //  Merge all the buffers into a single Buffer object.
  return Buffer.concat(chunks);

};

//  Array where all information about all the overridden requests are held.
var requestOverride = [];

/**
 * Overrides the current `request` function of `http` and `https` modules with
 * our own version which intercepts issues HTTP/HTTPS requests and forwards them
 * to the given `newRequest` function.
 *
 * @param  {Function} newRequest - a function handling requests; it accepts four arguments:
 *   - proto - a string with the overridden module's protocol name (either `http` or `https`)
 *   - overriddenRequest - the overridden module's request function already bound to module's object
 *   - options - the options of the issued request
 *   - callback - the callback of the issued request
 */
var overrideRequests = function(newRequest) {
  debug('overriding requests');

  ['http', 'https'].forEach(function(proto) {
    debug('- overriding request for', proto);

    var moduleName = proto, // 1 to 1 match of protocol and module is fortunate :)
        module = require(moduleName),
        overriddenRequest = module.request;

    if(requestOverride[moduleName]) {
      throw new Error('Module\'s request already overridden for ' + moduleName + ' protocol.');
    }

    //  Store the properties of the overridden request so that it can be restored later on.
    requestOverride[moduleName] = {
      module: module,
      request: overriddenRequest
    };

    module.request = function(options, callback) {
      return newRequest(proto, overriddenRequest.bind(module), options, callback);
    };

    debug('- overridden request for', proto);
  });
};

/**
 * Restores `request` function of `http` and `https` modules to values they
 * held before they were overridden by us.
 */
var restoreOverriddenRequests = function() {
  debug('restoring requests');

  //  Restore any overridden requests.
  _(requestOverride).keys().each(function(proto) {
    debug('- restoring request for', proto);

    var override = requestOverride[proto];
    if(override) {
      override.module.request = override.request;
      debug('- restored request for', proto);
    }
  });
  requestOverride = [];
};

function stringifyRequest(options, body) {
  var method = options.method || 'GET';

  if (body && typeof(body) !== 'string') {
    body = body.toString();
  }

  return method + ' ' + options.proto + '://' + options.hostname + options.path + ' ' + body;
}

exports.normalizeRequestOptions = normalizeRequestOptions;
exports.isBinaryBuffer = isBinaryBuffer;
exports.mergeChunks = mergeChunks;
exports.overrideRequests = overrideRequests;
exports.restoreOverriddenRequests = restoreOverriddenRequests;
exports.stringifyRequest = stringifyRequest;