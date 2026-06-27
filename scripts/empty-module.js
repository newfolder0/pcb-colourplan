// Empty stand-in aliased in place of jsPDF optional dependencies we never use
// (html2canvas, canvg - jsPDF's raster/.html() paths). We render PDFs through
// svg2pdf.js's vector path instead, so these are dead weight; aliasing them to
// this module keeps ~200 KB and their extra attack surface out of the bundle.
// If a code path ever does reach them, the call fails loudly rather than silently.
export default undefined;
