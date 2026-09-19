import solc from 'solc';
import fs from 'node:fs';
const input={language:'Solidity',sources:{'SpendWiseProof.sol':{content:fs.readFileSync('contracts/SpendWiseProof.sol','utf8')}},settings:{optimizer:{enabled:true,runs:200},evmVersion:'paris',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}};
const out=JSON.parse(solc.compile(JSON.stringify(input)));
for(const e of out.errors||[])console.log(e.formattedMessage);
if(out.errors?.some(e=>e.severity==='error'))process.exit(1);
const c=out.contracts['SpendWiseProof.sol'].SpendWiseProof;
fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/SpendWiseProof.json',JSON.stringify({compiler:solc.version(),evmVersion:'paris',abi:c.abi,bytecode:'0x'+c.evm.bytecode.object},null,2));
console.log('SpendWiseProof compiled successfully; bytecode bytes:',c.evm.bytecode.object.length/2);
