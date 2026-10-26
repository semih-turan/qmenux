export const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type ReviewApplication={id:string;requestedName:string;status:'PENDING_APPROVAL'|'REJECTED';revision:number;createdAt:string;submittedAt:string};
function timestamp(value:unknown):string {
  if(typeof value!=='string'||value.length!==24||new Date(value).toISOString()!==value)throw new Error('Invalid review');return value;
}
export function reviewApplication(value:unknown):ReviewApplication {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid review');
  const row=value as Record<string,unknown>;
  if(typeof row.id!=='string'||!uuidPattern.test(row.id)||typeof row.requestedName!=='string'||!row.requestedName.trim()||row.requestedName.length>200
    ||/[\x00-\x1f\x7f]/.test(row.requestedName)||!['PENDING_APPROVAL','REJECTED'].includes(String(row.status))||!Number.isInteger(row.revision)||(row.revision as number)<1||(row.revision as number)>2147483647)throw new Error('Invalid review');
  return {id:row.id.toLowerCase(),requestedName:row.requestedName,status:row.status as ReviewApplication['status'],revision:row.revision as number,createdAt:timestamp(row.createdAt),submittedAt:timestamp(row.submittedAt)};
}
