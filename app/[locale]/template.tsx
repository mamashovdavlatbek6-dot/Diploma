'use client';
import { motion,useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
export default function Template({children}:{children:ReactNode}){const reduced=useReducedMotion();return <motion.div className="page-transition" initial={false} animate={{opacity:1,y:0}} transition={{duration:reduced?0:.25}}>{children}</motion.div>;}
