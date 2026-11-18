import {checkOrigin,setAuthCookie,method,send,reportError} from '../lib/voting.js';
export default async function handler(req,res) {
  try {method(req,'POST');checkOrigin(req);setAuthCookie(req,res,'',0);return send(res,200,{ok:true});}
  catch(e){return reportError(res,e);}
}
