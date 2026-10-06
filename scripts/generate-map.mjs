import { writeFileSync } from 'node:fs';
const continents=[[[9,50],[40,24],[112,31],[175,70],[170,100],[135,113],[125,153],[85,143],[54,111],[20,93]],[[138,144],[196,164],[208,204],[176,274],[157,256],[144,208]],[[258,83],[315,76],[350,112],[337,165],[310,217],[275,175]],[[293,55],[340,38],[403,29],[448,36],[513,67],[563,69],[572,100],[526,135],[476,123],[445,167],[415,135],[375,100],[340,109]],[[475,215],[521,198],[556,221],[548,251],[499,254]],[[218,18],[252,17],[266,46],[237,62]]];
function inside(x,y,p){let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
const dots=[];for(let y=20;y<275;y+=5)for(let x=10;x<585;x+=5)if(continents.some(p=>inside(x,y,p)))dots.push([x,y]);
writeFileSync(new URL('../content/world-dots.json',import.meta.url),JSON.stringify(dots)+'\n');
