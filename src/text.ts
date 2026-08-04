import type { Sentence } from './contracts.js';
export const words = (text: string) => text.match(/[A-Za-z][A-Za-z'-]*/g) ?? [];
export function sentences(text: string): Sentence[] { const rx = /[^.!?\n]+[.!?]+|[^\n]+$/g; const out: Sentence[] = []; for (const m of text.matchAll(rx)) { const value=m[0].trim(); if (words(value).length) { const leading=m[0].indexOf(value); out.push({index:out.length+1,start:(m.index??0)+leading,end:(m.index??0)+leading+value.length,text:value}); } } return out; }
export const mean = (xs:number[]) => xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : 0;
export const deviation = (xs:number[], avg=mean(xs)) => xs.length ? Math.sqrt(mean(xs.map(x=>(x-avg)**2))) : 0;
