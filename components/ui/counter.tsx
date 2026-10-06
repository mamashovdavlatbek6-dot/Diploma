'use client';
import { useEffect,useRef } from 'react';import { useSpring,useReducedMotion } from 'motion/react';
export function Counter({value}:{value:number}){const ref=useRef<HTMLSpanElement>(null);const spring=useSpring(value,{stiffness:90,damping:22});const reduced=useReducedMotion();useEffect(()=>{spring.set(value);return spring.on('change',v=>{if(ref.current&&!document.hidden)ref.current.textContent=Math.round(v).toLocaleString();});},[value,spring]);return <span ref={reduced?undefined:ref}>{value.toLocaleString()}</span>;}
