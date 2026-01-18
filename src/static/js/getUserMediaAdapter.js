;(function initAdapter(globalScope, factory) {
  const adapter = factory(globalScope || {});
  if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = adapter;
  } else if (globalScope) {
    globalScope.getUserMediaAdapter = adapter;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function adapterFactory(root) {
  const navigatorRef = root && root.navigator ? root.navigator : {};
  const consoleRef = root && root.console ? root.console : { log: function noop() {} };
  const permissionsRef = navigatorRef && navigatorRef.permissions;
  const defaultConstraints = { audio: true, video: true };

  function safeNow() {
    if (root && root.performance && typeof root.performance.now === 'function') {
      return root.performance.now();
    }
    return Date.now();
  }

  function trace(message) {
    if (!message || !consoleRef || typeof consoleRef.log !== 'function') {
      return;
    }
    if (message[message.length - 1] === '\n') {
      message = message.substring(0, message.length - 1);
    }
    const prefix = (safeNow() / 1000).toFixed(3);
    consoleRef.log(prefix + ': ' + message);
  }

  function detectBrowser() {
    const ua = (navigatorRef && navigatorRef.userAgent ? navigatorRef.userAgent : '').toLowerCase();
    let name = 'unknown';
    let version = 0;
    let match = ua.match(/(edge|edg|edgios|edga)\/(\d+)/);
    if (match) {
      name = 'edge';
      version = parseInt(match[2], 10);
    } else if (/firefox\/(\d+)/.test(ua)) {
      match = ua.match(/firefox\/(\d+)/);
      name = 'firefox';
      version = match ? parseInt(match[1], 10) : 0;
    } else if (/chrome\/(\d+)/.test(ua)) {
      match = ua.match(/chrome\/(\d+)/);
      name = 'chrome';
      version = match ? parseInt(match[1], 10) : 0;
    } else if (/safari\/(\d+)/.test(ua) && /version\/(\d+)/.test(ua)) {
      match = ua.match(/version\/(\d+)/);
      name = 'safari';
      version = match ? parseInt(match[1], 10) : 0;
    }
    return { name, version, userAgent: ua };
  }

  const browserInfo = detectBrowser();
  const mediaDevices = navigatorRef.mediaDevices;
  const legacyGetUserMedia =
    navigatorRef.getUserMedia ||
    navigatorRef.webkitGetUserMedia ||
    navigatorRef.mozGetUserMedia ||
    navigatorRef.msGetUserMedia ||
    null;

  function resolveGetUserMediaImpl() {
    if (mediaDevices && typeof mediaDevices.getUserMedia === 'function') {
      return function modernGetUserMedia(constraints) {
        trace('Using navigator.mediaDevices.getUserMedia()');
        return mediaDevices.getUserMedia(constraints);
      };
    }
    if (legacyGetUserMedia) {
      return function legacyGetUserMediaPromise(constraints) {
        trace('Falling back to legacy navigator.getUserMedia');
        return new Promise(function executor(resolve, reject) {
          legacyGetUserMedia.call(navigatorRef, constraints, resolve, reject);
        });
      };
    }
    return null;
  }

  const getUserMediaImpl = resolveGetUserMediaImpl();
  const hasDisplayMedia = !!(mediaDevices && typeof mediaDevices.getDisplayMedia === 'function');

  function normalizeConstraints(input) {
    if (!input || typeof input === 'function') {
      return defaultConstraints;
    }
    if (typeof input === 'string') {
      if (input === 'audio') {
        return { audio: true, video: false };
      }
      if (input === 'video') {
        return { audio: false, video: true };
      }
    }
    return input;
  }

  function hasPermissionsApi() {
    return !!(permissionsRef && typeof permissionsRef.query === 'function');
  }

  function queryPermission(name) {
    if (!hasPermissionsApi()) {
      return Promise.resolve('unknown');
    }
    try {
      return permissionsRef
        .query({ name: name })
        .then(function (status) {
          return status && status.state ? status.state : 'unknown';
        })
        .catch(function () {
          return 'unknown';
        });
    } catch (err) {
      return Promise.resolve('unknown');
    }
  }

  function getMediaPermissionStatus() {
    return Promise.all([queryPermission('camera'), queryPermission('microphone')]).then(function (results) {
      return {
        camera: results[0],
        microphone: results[1],
      };
    });
  }

  function enumerateInputDevices() {
    if (!mediaDevices || typeof mediaDevices.enumerateDevices !== 'function') {
      return Promise.resolve([]);
    }
    return mediaDevices
      .enumerateDevices()
      .then(function (devices) {
        return (devices || []).filter(function (device) {
          return device && (device.kind === 'audioinput' || device.kind === 'videoinput');
        });
      })
      .catch(function () {
        return [];
      });
  }

  function createIceServer(url, username, password) {
    if (!url) {
      return null;
    }
    const config = { urls: url };
    if (username) {
      config.username = username;
    }
    if (password) {
      config.credential = password;
    }
    return config;
  }

  function attachMediaStream(element, stream) {
    if (!element) {
      throw new Error('attachMediaStream requires a DOM element');
    }
    if (!stream) {
      throw new Error('attachMediaStream requires a MediaStream');
    }
    trace('Attaching media stream');
    if ('srcObject' in element) {
      element.srcObject = stream;
    } else if ('mozSrcObject' in element) {
      element.mozSrcObject = stream;
    } else {
      const creator =
        (root.URL && typeof root.URL.createObjectURL === 'function' && root.URL.createObjectURL) ||
        (root.webkitURL && typeof root.webkitURL.createObjectURL === 'function' && root.webkitURL.createObjectURL);
      if (!creator) {
        throw new Error('Unable to attach stream: no supported URL.createObjectURL implementation found');
      }
      element.src = creator.call(root.URL || root.webkitURL, stream);
    }
    if (typeof element.play === 'function') {
      const playResult = element.play();
      if (playResult && typeof playResult.catch === 'function') {
        playResult.catch(function swallow() {});
      }
    }
    return element;
  }

  function reattachMediaStream(target, source) {
    if (!target) {
      throw new Error('reattachMediaStream requires a DOM element');
    }
    trace('Reattaching media stream');
    if ('srcObject' in target) {
      target.srcObject = source ? source.srcObject : null;
    } else if ('mozSrcObject' in target) {
      target.mozSrcObject = source ? source.mozSrcObject : null;
    } else {
      target.src = source ? source.src : '';
    }
    if (typeof target.play === 'function') {
      const playResult = target.play();
      if (playResult && typeof playResult.catch === 'function') {
        playResult.catch(function swallow() {});
      }
    }
    return target;
  }

  function requestUserMedia(constraints, callback) {
    let cb = callback;
    let requestedConstraints = constraints;
    if (typeof constraints === 'function' && callback === undefined) {
      cb = constraints;
      requestedConstraints = defaultConstraints;
    }
    const finalConstraints = normalizeConstraints(requestedConstraints);
    if (!getUserMediaImpl) {
      const unsupportedError = new Error('Browser does not appear to be WebRTC-capable');
      if (typeof cb === 'function') {
        cb(unsupportedError);
      }
      return Promise.reject(unsupportedError);
    }
    trace("Requesting access to local media with mediaConstraints:\n  '" + JSON.stringify(finalConstraints) + "'");
    return getUserMediaImpl(finalConstraints)
      .then(function onSuccess(stream) {
        if (typeof cb === 'function') {
          cb(null, stream);
        }
        return stream;
      })
      .catch(function onError(error) {
        if (typeof cb === 'function') {
          cb(error);
        }
        throw error;
      });
  }

  function legacyGetUserMediaWrapper(constraints, successCallback, errorCallback) {
    return requestUserMedia(constraints)
      .then(function handleSuccess(stream) {
        if (typeof successCallback === 'function') {
          successCallback(stream);
        }
        return stream;
      })
      .catch(function handleError(error) {
        if (typeof errorCallback === 'function') {
          errorCallback(error);
        }
        throw error;
      });
  }

  function primePeerConnectionGlobals() {
    if (!root) {
      return null;
    }
    const RTCPeerConnectionCtor =
      root.RTCPeerConnection ||
      root.webkitRTCPeerConnection ||
      root.mozRTCPeerConnection ||
      root.msRTCPeerConnection ||
      null;
    if (!root.RTCPeerConnection && RTCPeerConnectionCtor) {
      root.RTCPeerConnection = RTCPeerConnectionCtor;
    }
    return RTCPeerConnectionCtor;
  }

  primePeerConnectionGlobals();

  const adapter = {
    requestUserMedia,
    attachMediaStream,
    reattachMediaStream,
    createIceServer,
    detectBrowser,
    hasModernApi: !!(mediaDevices && typeof mediaDevices.getUserMedia === 'function'),
    canRequestMedia: !!getUserMediaImpl,
    defaultConstraints,
    supportsDisplayMedia: hasDisplayMedia,
    hasPermissionsApi: hasPermissionsApi(),
    getMediaPermissionStatus,
    enumerateInputDevices,
  };

  if (root) {
    root.webrtcDetectedBrowser = browserInfo.name;
    root.webrtcDetectedVersion = browserInfo.version;
    root.attachMediaStream = attachMediaStream;
    root.reattachMediaStream = reattachMediaStream;
    root.createIceServer = createIceServer;
    root.requestUserMedia = requestUserMedia;
    root.getUserMedia = legacyGetUserMediaWrapper;
    root.enumerateInputDevices = enumerateInputDevices;
    root.getMediaPermissionStatus = getMediaPermissionStatus;
  }

  return adapter;
});
