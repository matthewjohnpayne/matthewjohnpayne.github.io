// Runs the HelioLinC search off the main thread.
//   {type: 'init', det, obj, field}: the survey (detections and true objects).
//   {type: 'link', id, gammas, gammaDots, d, dt, falseRatio}: link, posting
//     {type: 'progress', id, f} after each hypothesis, then
//     {type: 'result', id, score, status, ms}.
import * as hl from './linking.js';

let survey = null;

self.onmessage = ({ data: msg }) => {
  if (msg.type === 'init') {
    survey = msg;
    return;
  }
  if (msg.type !== 'link' || !survey) return;
  const t0 = performance.now();
  const nReal = survey.obj.length;
  let det = survey.det, obj = survey.obj;
  if (msg.falseRatio > 0) {
    const nFalse = Math.round(msg.falseRatio * nReal);
    det = hl.addFalseTracklets(det, nFalse, survey.field);
    obj = new Int32Array(nReal + nFalse).fill(-1);
    obj.set(survey.obj);
  }
  const clusters = hl.link(det, survey.field.tRef, {
    gammas: msg.gammas, gammaDots: msg.gammaDots, d: msg.d, dt: msg.dt, zDir: msg.gammas.length > 1 ? msg.zDir : null,
    onProgress: (f) => self.postMessage({ type: 'progress', id: msg.id, f })
  });
  const { status, ...score } = hl.score(clusters, obj);
  const real = status.slice(0, nReal);
  self.postMessage({ type: 'result', id: msg.id, score, status: real, ms: performance.now() - t0 }, [real.buffer]);
};
