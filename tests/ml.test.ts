import { describe,expect,it } from 'vitest';import fixture from '@/ml/parity-fixture.json';import { predict,mlAnomaly } from '@/server/detection/ml';import { baseline,scenario } from '@/server/services/simulator';import { ewma,zScore } from '@/server/detection/baseline';
describe('Python / TypeScript inference parity',()=>{fixture.forEach((row,i)=>it(`matches Python probabilities ${i}`,()=>predict(row.features).forEach((p,j)=>expect(p).toBeCloseTo(row.probability[j],10))));});
it('ML accepts normal traffic',()=>expect(mlAnomaly(baseline(42,Date.UTC(2026,9,6)))).toEqual([]));
it('ML flags exfiltration flows',()=>expect(mlAnomaly(scenario('exfiltration',Date.UTC(2026,9,6)))).not.toEqual([]));
it('EWMA adapts gradually',()=>{let s=ewma(undefined,100);for(let i=0;i<20;i++)s=ewma(s,100);expect(zScore(s,100)).toBe(0);expect(zScore(s,1000)).toBeGreaterThan(5);expect(ewma(s,1000).mean).toBeGreaterThan(s.mean);});
