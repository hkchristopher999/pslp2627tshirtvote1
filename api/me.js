import {getSession,classRecord,method,send,reportError} from '../lib/voting.js';
export default async function handler(req,res) {
  try {
    method(req,'GET');
    const classId=getSession(req);
    return send(res,200,classId?await classRecord(classId):{authenticated:false});
  } catch(e) { return reportError(res,e); }
}
