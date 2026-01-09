// Lightweight client signals collector (deferred)
(function () {
  function getCanvasSignal() {
    try {
      var canvas = document.createElement("canvas");
      var ctx = canvas.getContext("2d");
      ctx.textBaseline = "top";
      ctx.font = "14px Arial";
      ctx.fillText("signal", 2, 2);
      return canvas.toDataURL().slice(-50);
    } catch (e) {
      return null;
    }
  }

  function getWebGLInfo() {
    try {
      var canvas = document.createElement("canvas");
      var gl = canvas.getContext("webgl");
      if (!gl) return { vendor: null, renderer: null };
      var ext = gl.getExtension("WEBGL_debug_renderer_info");
      return {
        vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : null,
        renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null,
      };
    } catch (e) {
      return { vendor: null, renderer: null };
    }
  }

  function getAudioSignal() {
    return new Promise(function (resolve) {
      try {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return resolve(null);
        var ctx = new Ctx();
        var oscillator = ctx.createOscillator();
        var analyser = ctx.createAnalyser();
        oscillator.connect(analyser);
        analyser.connect(ctx.destination);
        oscillator.start(0);
        var data = new Float32Array(analyser.frequencyBinCount);
        analyser.getFloatFrequencyData(data);
        oscillator.stop();
        ctx.close();
        resolve(Array.prototype.slice.call(data, 0, 10).join(",").slice(0, 50));
      } catch (e) {
        resolve(null);
      }
    });
  }

  function collectClientSignals() {
    return getAudioSignal().then(function (audioHash) {
      var now = new Date();
      var clientSignals = {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
        utcOffset: now.getTimezoneOffset(), // minutes from UTC (negative = ahead)
        browserTime: now.toISOString(), // for clock drift detection
        language: navigator.language || null,
        languages: navigator.languages || [],
        platform: navigator.platform || null,
        webdriver: navigator.webdriver === true,
        screen: window.screen
          ? window.screen.width + "x" + window.screen.height
          : null,
        colorDepth: window.screen ? window.screen.colorDepth : null,
        pixelRatio: window.devicePixelRatio || null,
        cpuCores: navigator.hardwareConcurrency || null,
        deviceMemory: navigator.deviceMemory || null,
        touchPoints: navigator.maxTouchPoints || 0,
        plugins: navigator.plugins ? navigator.plugins.length : null,
        cookiesEnabled: navigator.cookieEnabled,
        doNotTrack: navigator.doNotTrack === "1",
        canvasHash: getCanvasSignal(),
        webgl: getWebGLInfo(),
        audioHash: audioHash,
      };
      window.__clientSignals = clientSignals;
      return clientSignals;
    });
  }

  function runCollector(resolve) {
    collectClientSignals()
      .then(resolve)
      .catch(function () {
        resolve(window.__clientSignals || null);
      });
  }

  var ready = new Promise(function (resolve) {
    if ("requestIdleCallback" in window) {
      requestIdleCallback(
        function () {
          runCollector(resolve);
        },
        { timeout: 1200 }
      );
    } else {
      setTimeout(function () {
        runCollector(resolve);
      }, 300);
    }
  });

  window.__clientSignalsReady = ready;

  // ========== Phase 4: Behavior Detection ==========
  var behavior = {
    devtoolsOpen: false,
    devtoolsConfidence: "none",
    copyCount: 0,
    printAttempt: false,
    tabSwitches: 0,
    devtoolsShortcut: false,
    startTime: Date.now(),
    scrollDepth: 0,
    clickCount: 0,
  };

  window.__behavior = behavior;

  // DevTools detection (size threshold with stability)
  var devtoolsThreshold = 160;
  var devtoolsScore = 0;
  function checkDevTools() {
    var outerWidth = window.outerWidth || 0;
    var outerHeight = window.outerHeight || 0;
    var innerWidth = window.innerWidth || 0;
    var innerHeight = window.innerHeight || 0;

    if (!outerWidth || !outerHeight || !innerWidth || !innerHeight) {
      return;
    }

    var widthDiff = Math.abs(outerWidth - innerWidth);
    var heightDiff = Math.abs(outerHeight - innerHeight);
    var base = Math.min(outerWidth, outerHeight);
    var dynamicThreshold = Math.max(devtoolsThreshold, Math.round(base * 0.12));
    var isSmallViewport = innerWidth < 700 || innerHeight < 500;
    var suspected =
      !isSmallViewport &&
      (widthDiff > dynamicThreshold || heightDiff > dynamicThreshold);

    if (suspected) {
      devtoolsScore = Math.min(devtoolsScore + 1, 5);
    } else {
      devtoolsScore = Math.max(devtoolsScore - 1, 0);
    }

    if (devtoolsScore >= 3) {
      behavior.devtoolsOpen = true;
      behavior.devtoolsConfidence = "high";
    } else if (devtoolsScore === 2) {
      behavior.devtoolsConfidence = "medium";
    } else if (devtoolsScore === 1) {
      behavior.devtoolsConfidence = "low";
    } else {
      behavior.devtoolsOpen = false;
      behavior.devtoolsConfidence = "none";
    }
  }
  setInterval(checkDevTools, 1000);

  // Copy detection
  document.addEventListener("copy", function () {
    behavior.copyCount++;
  });

  // Print detection
  window.addEventListener("beforeprint", function () {
    behavior.printAttempt = true;
  });

  // Tab visibility
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      behavior.tabSwitches++;
    }
  });

  // DevTools keyboard shortcuts
  document.addEventListener("keydown", function (e) {
    // Ctrl+Shift+I, Ctrl+Shift+J, F12
    if (
      (e.ctrlKey && e.shiftKey && (e.key === "I" || e.key === "J")) ||
      e.key === "F12"
    ) {
      behavior.devtoolsShortcut = true;
    }
  });

  // Scroll depth tracking
  window.addEventListener("scroll", function () {
    var scrolled =
      ((window.scrollY + window.innerHeight) /
        document.documentElement.scrollHeight) *
      100;
    behavior.scrollDepth = Math.max(behavior.scrollDepth, Math.round(scrolled));
  });

  // Click count
  document.addEventListener("click", function () {
    behavior.clickCount++;
  });
})();
