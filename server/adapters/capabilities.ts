export interface IdentityAdapter {enabled:boolean;identify(request:Request):Promise<{id:string;role:'viewer'|'admin'}|null>}
export interface PaymentAdapter {enabled:boolean;checkout(product:string):Promise<{url:string}|null>}
export const identity:IdentityAdapter={enabled:false,async identify(){return null;}};
export const payments:PaymentAdapter={enabled:false,async checkout(){return null;}};
