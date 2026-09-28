"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(() => {
var exports = {};
exports.id = "instrumentation";
exports.ids = ["instrumentation"];
exports.modules = {

/***/ "(instrument)/./src/instrumentation.ts":
/*!********************************!*\
  !*** ./src/instrumentation.ts ***!
  \********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   onRequestError: () => (/* binding */ onRequestError)\n/* harmony export */ });\n/**\r\n * Vangnet voor élke onafgevangen serverfout: Server Components, route handlers,\r\n * server actions, middleware en de cron-routes. Next roept deze hook aan vlak\r\n * voordat de fout een 500 wordt, dus we hoeven nergens anders iets te instrumenteren.\r\n *\r\n * Wat hier NIET langskomt: fouten die code zelf al afvangt. De ~780 plekken met het\r\n * `{ ok: false, error }`-patroon blijven dus onzichtbaar in de log — die zijn\r\n * afgehandeld. Is zo'n geval tóch een incident, roep dan logFout() daar handmatig aan.\r\n */ const onRequestError = async (err, request, context)=>{\n    // Dynamisch importeren: instrumentation.ts wordt ook in de edge-runtime geladen, en\n    // log.ts trekt node:crypto + de Supabase-adminclient mee.\n    const { logFout, foutNaarInvoer, isVerwachteFout } = await Promise.all(/*! import() */[__webpack_require__.e(\"vendor-chunks/next\"), __webpack_require__.e(\"vendor-chunks/@supabase\"), __webpack_require__.e(\"vendor-chunks/tslib\"), __webpack_require__.e(\"vendor-chunks/iceberg-js\"), __webpack_require__.e(\"_instrument_src_lib_fouten_log_ts\")]).then(__webpack_require__.bind(__webpack_require__, /*! ./lib/fouten/log */ \"(instrument)/./src/lib/fouten/log.ts\"));\n    if (isVerwachteFout(err)) return;\n    const pad = request.path ?? '';\n    await logFout(foutNaarInvoer(err, {\n        omgeving: pad.startsWith('/api/cron') ? 'cron' : 'server',\n        bron: context.routePath || pad || 'onbekend',\n        soort: context.routeType,\n        url: pad,\n        extra: {\n            method: request.method,\n            routerKind: context.routerKind,\n            ...context.revalidateReason ? {\n                revalidateReason: context.revalidateReason\n            } : {}\n        }\n    }));\n};\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKGluc3RydW1lbnQpLy4vc3JjL2luc3RydW1lbnRhdGlvbi50cyIsIm1hcHBpbmdzIjoiOzs7O0FBRUE7Ozs7Ozs7O0NBUUMsR0FDTSxNQUFNQSxpQkFBaUQsT0FBT0MsS0FBS0MsU0FBU0M7SUFDakYsb0ZBQW9GO0lBQ3BGLDBEQUEwRDtJQUMxRCxNQUFNLEVBQUVDLE9BQU8sRUFBRUMsY0FBYyxFQUFFQyxlQUFlLEVBQUUsR0FBRyxNQUFNLDRZQUEwQjtJQUVyRixJQUFJQSxnQkFBZ0JMLE1BQU07SUFFMUIsTUFBTU0sTUFBTUwsUUFBUU0sSUFBSSxJQUFJO0lBQzVCLE1BQU1KLFFBQ0pDLGVBQWVKLEtBQUs7UUFDbEJRLFVBQVVGLElBQUlHLFVBQVUsQ0FBQyxlQUFlLFNBQVM7UUFDakRDLE1BQU1SLFFBQVFTLFNBQVMsSUFBSUwsT0FBTztRQUNsQ00sT0FBT1YsUUFBUVcsU0FBUztRQUN4QkMsS0FBS1I7UUFDTFMsT0FBTztZQUNMQyxRQUFRZixRQUFRZSxNQUFNO1lBQ3RCQyxZQUFZZixRQUFRZSxVQUFVO1lBQzlCLEdBQUlmLFFBQVFnQixnQkFBZ0IsR0FBRztnQkFBRUEsa0JBQWtCaEIsUUFBUWdCLGdCQUFnQjtZQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3BGO0lBQ0Y7QUFFSixFQUFDIiwic291cmNlcyI6WyJDOlxcVXNlcnNcXHQua2FtbWluZ2FcXGV2YS1tYWlsaW50YWtlXFxhcHBzXFxkYXNoYm9hcmRcXHNyY1xcaW5zdHJ1bWVudGF0aW9uLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0eXBlIHsgSW5zdHJ1bWVudGF0aW9uIH0gZnJvbSAnbmV4dCdcclxuXHJcbi8qKlxyXG4gKiBWYW5nbmV0IHZvb3Igw6lsa2Ugb25hZmdldmFuZ2VuIHNlcnZlcmZvdXQ6IFNlcnZlciBDb21wb25lbnRzLCByb3V0ZSBoYW5kbGVycyxcclxuICogc2VydmVyIGFjdGlvbnMsIG1pZGRsZXdhcmUgZW4gZGUgY3Jvbi1yb3V0ZXMuIE5leHQgcm9lcHQgZGV6ZSBob29rIGFhbiB2bGFrXHJcbiAqIHZvb3JkYXQgZGUgZm91dCBlZW4gNTAwIHdvcmR0LCBkdXMgd2UgaG9ldmVuIG5lcmdlbnMgYW5kZXJzIGlldHMgdGUgaW5zdHJ1bWVudGVyZW4uXHJcbiAqXHJcbiAqIFdhdCBoaWVyIE5JRVQgbGFuZ3Nrb210OiBmb3V0ZW4gZGllIGNvZGUgemVsZiBhbCBhZnZhbmd0LiBEZSB+NzgwIHBsZWtrZW4gbWV0IGhldFxyXG4gKiBgeyBvazogZmFsc2UsIGVycm9yIH1gLXBhdHJvb24gYmxpanZlbiBkdXMgb256aWNodGJhYXIgaW4gZGUgbG9nIOKAlCBkaWUgemlqblxyXG4gKiBhZmdlaGFuZGVsZC4gSXMgem8nbiBnZXZhbCB0w7NjaCBlZW4gaW5jaWRlbnQsIHJvZXAgZGFuIGxvZ0ZvdXQoKSBkYWFyIGhhbmRtYXRpZyBhYW4uXHJcbiAqL1xyXG5leHBvcnQgY29uc3Qgb25SZXF1ZXN0RXJyb3I6IEluc3RydW1lbnRhdGlvbi5vblJlcXVlc3RFcnJvciA9IGFzeW5jIChlcnIsIHJlcXVlc3QsIGNvbnRleHQpID0+IHtcclxuICAvLyBEeW5hbWlzY2ggaW1wb3J0ZXJlbjogaW5zdHJ1bWVudGF0aW9uLnRzIHdvcmR0IG9vayBpbiBkZSBlZGdlLXJ1bnRpbWUgZ2VsYWRlbiwgZW5cclxuICAvLyBsb2cudHMgdHJla3Qgbm9kZTpjcnlwdG8gKyBkZSBTdXBhYmFzZS1hZG1pbmNsaWVudCBtZWUuXHJcbiAgY29uc3QgeyBsb2dGb3V0LCBmb3V0TmFhckludm9lciwgaXNWZXJ3YWNodGVGb3V0IH0gPSBhd2FpdCBpbXBvcnQoJy4vbGliL2ZvdXRlbi9sb2cnKVxyXG5cclxuICBpZiAoaXNWZXJ3YWNodGVGb3V0KGVycikpIHJldHVyblxyXG5cclxuICBjb25zdCBwYWQgPSByZXF1ZXN0LnBhdGggPz8gJydcclxuICBhd2FpdCBsb2dGb3V0KFxyXG4gICAgZm91dE5hYXJJbnZvZXIoZXJyLCB7XHJcbiAgICAgIG9tZ2V2aW5nOiBwYWQuc3RhcnRzV2l0aCgnL2FwaS9jcm9uJykgPyAnY3JvbicgOiAnc2VydmVyJyxcclxuICAgICAgYnJvbjogY29udGV4dC5yb3V0ZVBhdGggfHwgcGFkIHx8ICdvbmJla2VuZCcsXHJcbiAgICAgIHNvb3J0OiBjb250ZXh0LnJvdXRlVHlwZSxcclxuICAgICAgdXJsOiBwYWQsXHJcbiAgICAgIGV4dHJhOiB7XHJcbiAgICAgICAgbWV0aG9kOiByZXF1ZXN0Lm1ldGhvZCxcclxuICAgICAgICByb3V0ZXJLaW5kOiBjb250ZXh0LnJvdXRlcktpbmQsXHJcbiAgICAgICAgLi4uKGNvbnRleHQucmV2YWxpZGF0ZVJlYXNvbiA/IHsgcmV2YWxpZGF0ZVJlYXNvbjogY29udGV4dC5yZXZhbGlkYXRlUmVhc29uIH0gOiB7fSksXHJcbiAgICAgIH0sXHJcbiAgICB9KSxcclxuICApXHJcbn1cclxuIl0sIm5hbWVzIjpbIm9uUmVxdWVzdEVycm9yIiwiZXJyIiwicmVxdWVzdCIsImNvbnRleHQiLCJsb2dGb3V0IiwiZm91dE5hYXJJbnZvZXIiLCJpc1ZlcndhY2h0ZUZvdXQiLCJwYWQiLCJwYXRoIiwib21nZXZpbmciLCJzdGFydHNXaXRoIiwiYnJvbiIsInJvdXRlUGF0aCIsInNvb3J0Iiwicm91dGVUeXBlIiwidXJsIiwiZXh0cmEiLCJtZXRob2QiLCJyb3V0ZXJLaW5kIiwicmV2YWxpZGF0ZVJlYXNvbiJdLCJpZ25vcmVMaXN0IjpbXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(instrument)/./src/instrumentation.ts\n");

/***/ }),

/***/ "../app-render/after-task-async-storage.external":
/*!***********************************************************************************!*\
  !*** external "next/dist/server/app-render/after-task-async-storage.external.js" ***!
  \***********************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/server/app-render/after-task-async-storage.external.js");

/***/ }),

/***/ "../app-render/work-async-storage.external":
/*!*****************************************************************************!*\
  !*** external "next/dist/server/app-render/work-async-storage.external.js" ***!
  \*****************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/server/app-render/work-async-storage.external.js");

/***/ }),

/***/ "../app-render/work-unit-async-storage.external":
/*!**********************************************************************************!*\
  !*** external "next/dist/server/app-render/work-unit-async-storage.external.js" ***!
  \**********************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/server/app-render/work-unit-async-storage.external.js");

/***/ }),

/***/ "next/dist/compiled/next-server/app-page.runtime.dev.js":
/*!*************************************************************************!*\
  !*** external "next/dist/compiled/next-server/app-page.runtime.dev.js" ***!
  \*************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/compiled/next-server/app-page.runtime.dev.js");

/***/ })

};
;

// load runtime
var __webpack_require__ = require("./webpack-runtime.js");
__webpack_require__.C(exports);
var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
var __webpack_exports__ = (__webpack_exec__("(instrument)/./src/instrumentation.ts"));
module.exports = __webpack_exports__;

})();