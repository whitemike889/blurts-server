"use strict";

/* eslint-disable no-unused-vars */
/* global _dntEnabled */
/* global ga */


const hasParent = (el, selector) => {
  while (el.parentNode) {
    el = el.parentNode;
    if (el.dataset && el.dataset.analyticsId === selector)
      return el;
  }
  return null;
};

const setMetricsIds = (el) => {
  if (hasParent(el, "scan-another-email")) {
    el.dataset.eventCategory = "Scan Another Email Form";
  }
  return;
};


function getLocation() {
  const eventLocation = document.querySelectorAll("[data-page-label]");
  if (eventLocation.length > 0) {
    return `Page ID: ${eventLocation[0].dataset.pageLabel}`;
  } else {
    return "Page ID: Undefined Page";
  }
}

async function sendPing(el, eventAction, eventLabel = null) {
  if (typeof(ga) !== "undefined" && !el.classList.contains("hide")) {
    if (!eventLabel) {
      eventLabel = `${getLocation()}`;
    }
    const eventCategory = `[v2] ${el.dataset.eventCategory}`;
    if (eventCategory.includes("Scan")) {
      // Append user status to eventLabel for scan form events.
      eventLabel = `${eventLabel} [Signed in user: ${document.body.dataset.signedInUser}]`;
    }
    return ga("send", "event", eventCategory, eventAction, eventLabel);
  }
}

function appendFxaParams(url, storageObject) {
  getUTMNames().forEach(param => {
    if (storageObject[param]) {
      url.searchParams.append(param, encodeURIComponent(storageObject[param]));
    }
  });
  return url;
}

function getFxaUtms(url) {
  if (sessionStorage) {
    return appendFxaParams(url, sessionStorage);
  }

  return appendFxaParams(url, document.body.dataset);
}

function saveReferringPageData(utmParams) {
  if (sessionStorage) {
    getUTMNames().forEach(param => {
      if(utmParams.get(param)) {
        sessionStorage[param] = utmParams.get(param);
      }
    });
    return;
  }
}

function getUTMNames() {
  return ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
}

(() => {
  const win = window;
  const winLocationSearch = win.location.search;

  let winLocation = win.location;

  // Check for DoNotTrack header before running GA script
  if (!_dntEnabled()) {
    (function(i,s,o,g,r,a,m){i["GoogleAnalyticsObject"]=r;i[r]=i[r]||function(){
    (i[r].q=i[r].q||[]).push(arguments);},i[r].l=1*new Date();a=s.createElement(o),
    m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m);
    })(window,document,"script","https://www.google-analytics.com/analytics.js","ga");
  }

  // Remove token and hash values from URL so that they aren't sent to GA
  if (winLocationSearch.includes("token=") || winLocationSearch.includes("hash=")) {
    winLocation = winLocation.toString().replace(/[?&]token=[A-Za-z0-9_-]+/, "").replace(/&hash=[A-Za-z0-9_-]+/, "");
    win.history.replaceState({}, "", winLocation);
  }

  const gaEnabled = (typeof(ga) !== "undefined");
  const utmParamsInUrl = (winLocationSearch.includes("utm_"));

  const removeUtmsFromUrl = () => {
    if (utmParamsInUrl) {
      win.history.replaceState({}, "", winLocation.toString().replace(/[?&]utm_.*/g, ""));
    }
  };

  // Store UTM params in session
  if (utmParamsInUrl) {
    saveReferringPageData(new URL(winLocation).searchParams);
  }

  if (gaEnabled) {
    ga("create", "UA-77033033-16");
    ga("set", "anonymizeIp", true);
    ga("set", "transport", "beacon");

    ga("send", "pageview", {
      hitCallback: function() {
        removeUtmsFromUrl();
      },
    });

    document.querySelectorAll(".send-ga-ping").forEach((el) => {
      el.addEventListener("click", async(e) => {
        const eventCategory = e.target.dataset.eventCategory;
        const eventAction = e.target.dataset.eventAction;
        const eventLabel = e.target.dataset.eventLabel;
        ga("send", "event", eventCategory, eventAction, eventLabel);
      });
    });
  } else {
    removeUtmsFromUrl();
  }

  const setMetricsIds = (el) => {
    if (hasParent(el, "scan-another-email")) {
      el.dataset.eventCategory = "Scan Another Email Form";
    }
    if (el.dataset.entrypoint && hasParent(el, "sign-up-banner")) {
      el.dataset.eventCategory = `${el.dataset.eventCategory} - Banner`;
      el.dataset.entrypoint = `${el.dataset.entrypoint}-banner`;
    }
    return;
  };

  // Update data-event-category and data-fxa-entrypoint if the element
  // is nested inside a sign up banner.
  document.querySelectorAll("#scan-user-email, .open-oauth").forEach(el => {
    setMetricsIds(el);
  });


  document.querySelectorAll(".open-oauth").forEach( async(el) => {
    const fxaUrl = new URL("/metrics-flow?", document.body.dataset.fxaAddress);

    try {
      const response = await fetch(fxaUrl, {credentials: "omit"});
      fxaUrl.searchParams.append("entrypoint", encodeURIComponent(el.dataset.entrypoint));
      if (response && response.status === 200) {
        const {flowId, flowBeginTime} = await response.json();
        el.dataset.flowId = flowId;
        el.dataset.flowBeginTime = flowBeginTime;
      }
    } catch(e) {
      // should we do anything with this?
    }
  });

  if (typeof(ga) !== "undefined") {
    const pageLocation = getLocation();

    // Elements for which we send Google Analytics "View" pings...
    const eventTriggers = [
      "#scan-user-email",
      "#add-another-email-form",
      ".open-oauth",
    ];

    // Send number of foundBreaches on Scan, Full Report, and User Dashboard pageviews
    if (pageLocation === ("Scan Results")) {
      const breaches = document.querySelectorAll(".breach-card");
      ga("send", "event", "[v2] Breach Count", "Returned Breaches", `${pageLocation}`, breaches.length);
    }

    // Send "View" pings and add event listeners.
    document.querySelectorAll(eventTriggers).forEach(el => {
      sendPing(el, "View", pageLocation);
      if (["BUTTON", "A"].includes(el.tagName)) {
        el.addEventListener("click", async(e) => {
          await sendPing(el, "Engage", pageLocation);
        });
      }
    });

    // Add event listeners to event triggering elements
    // for which we do not send "View" pings.
    document.querySelectorAll("[data-ga-link]").forEach((el) => {
      el.addEventListener("click", async(e) => {
        const linkId = `Link ID: ${e.target.dataset.eventLabel}`;
        await sendPing(el, "Click", `${linkId}`);
      });
    });
  }
})();


