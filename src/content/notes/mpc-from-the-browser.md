---
title: "Which MPC data a static web page can load"
date: "2026-10-17"
tags: [mpc, web]
summary: "Several MPC pages and the Summary API can be fetched from any website; the orbit API allows this site but cannot be called from a browser."
status: draft
source: "curl with an Origin header, 2026-10-17; src/scripts/mpcstats/summary.js; tools/export_mpcorb_samples.py."
---

A page on GitHub Pages has no server, so any live data must come from the reader's browser, and the data's server must allow that with an `Access-Control-Allow-Origin` header. Checked on 17 October 2026:

- **Allowed from any site** (`Access-Control-Allow-Origin: *`): the [recent MPECs](https://minorplanetcenter.net/mpec/RecentMPECs.html), the [NEO Confirmation Page table](https://minorplanetcenter.net/iau/NEO/toconfirm_tabular.html), the [NEA orbit file](https://minorplanetcenter.net/iau/MPCORB/NEA.txt) and the [list of unusual minor planets](https://www.minorplanetcenter.net/iau/lists/Unusual.html).
- **The [Summary API](https://docs.minorplanetcenter.net/mpc-ops-docs/apis/summary/)** takes a POST with a JSON body, which a browser can send; "MPC at a glance" on this site uses it.
- **The orbit API, `get-orb`**, allows requests from this site, but it accepts only a GET request with a JSON body. Browsers will not send a body with GET, and the API answers a POST with "405 Method Not Allowed". So the orbits on the [mpc_orb page](/software/mpc-orb/) are fetched when the site is built, not by the reader's browser.
