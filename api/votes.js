import {getSession,validVotes,saveVotes,checkOrigin,method,requestBody,send,reportError} from '../lib/voting.js';
export default async function handler(req,res) {
  try {
    method(req,'PUT');checkOrigin(req);
    const classId=getSession(req);
    if (!classId) return send(res,401,{error:'登入已失效，請重新登入'});
    const {votes}=requestBody(req);
    if (!validVotes(votes)) return send(res,400,{error:'必須提供 16 件作品的票數，每項為 0 至 99,999 的整數'});
    return send(res,200,await saveVotes(classId,votes));
  } catch(e) { return reportError(res,e); }
}
