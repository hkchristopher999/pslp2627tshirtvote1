import {getSession,summary,method,send,reportError} from '../lib/voting.js';
export default async function handler(req,res) {
  try {
    method(req,'GET');
    if (!getSession(req)) return send(res,401,{error:'登入已失效，請重新登入'});
    return send(res,200,await summary());
  } catch(e) { return reportError(res,e); }
}
