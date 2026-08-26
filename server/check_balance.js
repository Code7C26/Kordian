const fs = require('fs');
const s = fs.readFileSync('server.js','utf8');
let par=0, br=0, sq=0;
for (let i=0;i<s.length;i++){
  const ch=s[i];
  if(ch==='(') par++;
  else if(ch===')') par--;
  else if(ch==='{') br++;
  else if(ch==='}') br--;
  else if(ch==='[') sq++;
  else if(ch===']') sq--;
  if(par<0||br<0||sq<0){
    const start=Math.max(0,i-80);
    const end=Math.min(s.length,i+80);
    console.log('NEG at', i+1, 'char', ch);
    console.log(s.slice(start,end));
    process.exit(0);
  }
}
console.log('FINAL',par,br,sq);
