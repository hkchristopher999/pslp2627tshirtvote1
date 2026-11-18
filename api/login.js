import {checkOrigin,checkLoginAllowed,clearLoginFailures,validLogin,issueSession,setAuthCookie,classRecord,logLoginFailure,method,requestBody,send,reportError} from '../lib/voting.js';
export default async function handler(req,res) {
  try {
    method(req,'POST');checkOrigin(req);
    const body=requestBody(req);
    const classId=typeof body.classId==='string'?body.classId.trim().toUpperCase():'';
    const password=body.password;
    if (!classId || typeof password!=='string') return send(res,401,{error:'班別或密碼不正確'});
    const key=await checkLoginAllowed(req,classId);
    if (!validLogin(classId,password)) {await logLoginFailure(key);return send(res,401,{error:'班別或密碼不正確'});}
    await clearLoginFailures(key);
    const user=await classRecord(classId);
    setAuthCookie(req,res,issueSession(classId));
    return send(res,200,user);
  } catch(e) { return reportError(res,e); }
}
