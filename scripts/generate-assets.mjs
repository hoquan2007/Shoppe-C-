import { mkdir, writeFile } from "node:fs/promises";
const dir = new URL("../frontend/public/assets/", import.meta.url);
await mkdir(dir, { recursive: true });
const art = {
  headphones: `<path d="M111 210v-41a89 89 0 0 1 178 0v41" fill="none" stroke="#8d9587" stroke-width="30"/><path d="M111 194v-25a89 89 0 0 1 178 0v25" fill="none" stroke="#d8dbce" stroke-width="19"/><g transform="rotate(-12 115 231)"><rect x="83" y="180" width="57" height="107" rx="25" fill="#757f72"/><rect x="99" y="183" width="47" height="102" rx="22" fill="#b9c1ac"/><rect x="120" y="191" width="24" height="85" rx="12" fill="#d3d8c5"/></g><g transform="rotate(12 285 231)"><rect x="260" y="180" width="57" height="107" rx="25" fill="#757f72"/><rect x="254" y="183" width="47" height="102" rx="22" fill="#b9c1ac"/><rect x="256" y="191" width="24" height="85" rx="12" fill="#d3d8c5"/></g>`,
  bag: `<path d="M120 144 104 319q96 14 192-2l-16-173Z" fill="#c4b399"/><path d="M124 147 114 310q83 13 172 0l-10-163Z" fill="#e2d5be"/><path d="M155 165V111q0-48 45-48t45 48v54" fill="none" stroke="#ab9678" stroke-width="15"/><path d="M155 155V108q0-42 45-42t45 42v47" fill="none" stroke="#e1d3bb" stroke-width="8"/><path d="M133 154 125 297m142-143 8 143" stroke="#b5a185" stroke-width="2" stroke-dasharray="4 4"/><text x="200" y="240" text-anchor="middle" font-family="Georgia" font-size="18" letter-spacing="4" fill="#8c846c">everyday</text><text x="200" y="260" text-anchor="middle" font-family="Arial" font-size="7" letter-spacing="3" fill="#ab9a7f">LITTLE THINGS MATTER</text>`,
  bottle: `<rect x="159" y="102" width="82" height="28" rx="7" fill="#6e8178"/><rect x="151" y="123" width="98" height="199" rx="25" fill="#9bb0a2"/><path d="M157 148q12-28 25-16v169q-19 2-25-18Z" fill="#b7c8b9"/><rect x="157" y="91" width="86" height="24" rx="8" fill="#809487"/><path d="M170 93V78q30-20 60 0v15" fill="none" stroke="#617c6d" stroke-width="6"/><text x="200" y="230" text-anchor="middle" font-family="Arial" font-size="10" letter-spacing="4" fill="#e0e8da">DAILY</text><path d="M187 243h26" stroke="#d8e2d2"/>`,
  shirt: `<path d="m145 89-75 50 37 71 38-22v130h110V188l38 22 37-71-75-50q-55 25-110 0Z" fill="#d6c7b1"/><path d="m145 89 25 19q30 20 60 0l25-19" fill="none" stroke="#b4a78f" stroke-width="8"/><path d="M147 121v172m107-172v172M116 138l-15 28" stroke="#e9dfcd" stroke-width="5" opacity=".6"/><path d="M146 307h108" stroke="#bfae96" stroke-width="2"/>`,
  speaker: `<rect x="105" y="132" width="190" height="157" rx="40" fill="#9e9c8e"/><rect x="110" y="137" width="180" height="147" rx="35" fill="#bfbdae"/><pattern id="mesh" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".9" fill="#7e7f72"/></pattern><rect x="117" y="146" width="166" height="130" rx="30" fill="url(#mesh)"/><path d="M153 132V95q47-35 94 0v37" fill="none" stroke="#8d8f80" stroke-width="10"/><rect x="173" y="197" width="54" height="27" rx="3" fill="#ccba93"/><text x="200" y="215" text-anchor="middle" font-family="Arial" font-size="10" fill="#6a6a58">mono</text>`,
  lamp: `<ellipse cx="209" cy="325" rx="74" ry="14" fill="#b9a28b"/><path d="m205 318 16-149" stroke="#c3ad96" stroke-width="10"/><path d="m211 175-57-45 58-70 84 45-27 73Z" fill="#c1a488"/><path d="m154 130 58-70 84 45-27 73q-68 20-115-48Z" fill="#d2b99f"/><ellipse cx="210" cy="157" rx="64" ry="20" transform="rotate(22 210 157)" fill="#b18f70"/><ellipse cx="210" cy="157" rx="51" ry="11" transform="rotate(22 210 157)" fill="#f0dfbf"/><circle cx="217" cy="177" r="8" fill="#ae937a"/>`,
  shoes: `<path d="M84 225q24-49 24-85 35 43 68 18l35-39 35 66 65 35q26 16 12 41l-18 15H95q-33-18-11-51Z" fill="#ddd6c5"/><path d="m103 173 36 25 39-27 41 28 33 15" fill="none" stroke="#aeb8a2" stroke-width="24"/><path d="m179 153 47 43m-37-51 49 43" stroke="#eee9d8" stroke-width="6"/><path d="M82 246q80 15 244-3l-4 23q-98 23-229 9Z" fill="#f3ebdc"/><path d="M95 277h208" stroke="#b7b2a1" stroke-width="5"/>`,
  skincare: `<rect x="105" y="136" width="75" height="175" rx="11" fill="#c5cbbb"/><rect x="116" y="111" width="52" height="28" rx="4" fill="#a2b09a"/><rect x="116" y="192" width="53" height="68" rx="2" fill="#e5e7d9"/><text x="143" y="214" text-anchor="middle" font-family="Georgia" font-size="11" fill="#7e8b74">gentle</text><path d="M129 228h28m-24 8h20" stroke="#b6beaa"/><rect x="204" y="193" width="90" height="118" rx="12" fill="#d2c3b0"/><rect x="202" y="180" width="94" height="29" rx="7" fill="#bfa98d"/><rect x="217" y="237" width="64" height="38" fill="#eee4d1"/><text x="249" y="260" text-anchor="middle" font-family="Georgia" font-size="11" fill="#9f8d72">daily care</text>`,
  watch: `<rect x="173" y="43" width="54" height="298" rx="20" fill="#a98f72"/><path d="M180 54v270m40-270v270" stroke="#c6b294" stroke-width="2" stroke-dasharray="4 3"/><circle cx="200" cy="193" r="64" fill="#bca783"/><circle cx="200" cy="193" r="57" fill="#eee9d8"/><circle cx="200" cy="193" r="51" fill="#f7f2e4"/><path d="M200 151v8m0 68v8m-42-42h8m68 0h8" stroke="#b5a383" stroke-width="2"/><path d="M200 163v30l23 12" fill="none" stroke="#877c64" stroke-width="3"/><circle cx="200" cy="193" r="4" fill="#ab9473"/><rect x="264" y="181" width="8" height="21" rx="3" fill="#a58f6c"/>`,
  keyboard: `<g transform="rotate(-12 200 200)"><rect x="55" y="130" width="290" height="161" rx="14" fill="#a3aca0"/><rect x="60" y="125" width="280" height="155" rx="12" fill="#d4dbcc"/>${Array.from({ length: 5 }, (_, r) => Array.from({ length: 12 }, (_, c) => `<rect x="${70 + c * 22}" y="${139 + r * 25}" width="18" height="19" rx="3" fill="${r === 0 || c === 0 ? "#a7b39c" : "#eff0e5"}" stroke="#bac4b0" stroke-width=".5"/>`).join("")).join("")}<rect x="138" y="239" width="106" height="19" rx="3" fill="#a7b39c"/></g>`,
  notebook: `<g transform="rotate(-13 200 200)"><rect x="119" y="79" width="172" height="247" rx="7" fill="#9b8e7c"/><rect x="111" y="73" width="172" height="247" rx="7" fill="#cfbea5"/><path d="M128 76v241" stroke="#b29d7f" stroke-width="3"/><rect x="246" y="73" width="7" height="247" fill="#9c8a6c"/><text x="190" y="171" text-anchor="middle" font-family="Georgia" font-size="18" fill="#f7ecd5">soft notes</text><text x="190" y="195" text-anchor="middle" font-family="Arial" font-size="7" letter-spacing="2" fill="#968267">MAKE ROOM FOR IDEAS</text></g>`,
  backpack: `<rect x="177" y="66" width="46" height="29" rx="12" fill="none" stroke="#849180" stroke-width="9"/><path d="M116 139q0-60 84-60t84 60l16 160q-99 35-200 0Z" fill="#a6b29c"/><path d="M128 134q4-42 72-42t72 42" fill="none" stroke="#d4dbca" stroke-width="3"/><rect x="123" y="217" width="154" height="86" rx="17" fill="#bdc7b0"/><path d="M137 232h125" stroke="#7d8e72" stroke-width="3"/><rect x="182" y="164" width="36" height="24" rx="2" fill="#d7c5a6"/><text x="200" y="180" text-anchor="middle" font-size="8" font-family="Arial" fill="#8e846b">CITY</text>`,
};
art.lifestyle = art.bottle;
const colors = [
  "#eeede6",
  "#f1e9df",
  "#e8ede6",
  "#f2ede5",
  "#eaece7",
  "#f4e9dd",
  "#e9ece4",
  "#edf0e6",
  "#f1eae0",
  "#e8ece7",
  "#f2eade",
  "#e6ece4",
];
const defs = `<defs><filter id="shadow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="8"/></filter><linearGradient id="light" x2="1" y2="1"><stop stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>`;
for (const [i, [name, shape]] of Object.entries(art).entries()) {
  await writeFile(
    new URL(`product-${name}.svg`, dir),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">${defs}<rect width="400" height="400" fill="${colors[i % colors.length]}"/><circle cx="310" cy="65" r="180" fill="url(#light)"/><ellipse cx="205" cy="332" rx="104" ry="12" fill="#7f8065" opacity=".13" filter="url(#shadow)"/>${shape}</svg>`,
  );
}
await writeFile(
  new URL("hero.svg", dir),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 400">${defs}<circle cx="245" cy="195" r="155" fill="#dfe7d8"/><circle cx="245" cy="195" r="124" fill="none" stroke="#c6d2ba" stroke-width=".7"/><ellipse cx="249" cy="366" rx="180" ry="17" fill="#748367" opacity=".13" filter="url(#shadow)"/><path d="M38 320h345v80H38z" fill="#d5ddc7"/><path d="M38 320h345l-35-21H77Z" fill="#e0e6d6"/><g transform="translate(78 -18) rotate(10 200 200) scale(.88)">${art.headphones}</g><g transform="translate(-35 102) scale(.65)">${art.bag}</g><g transform="translate(216 168) scale(.5)">${art.bottle}</g><path d="m360 78 4 12 12 4-12 4-4 12-4-12-12-4 12-4Z" fill="#9caa8b"/><circle cx="95" cy="88" r="3" fill="#c4b393"/><path d="m61 198 4 8 8 4-8 4-4 8-4-8-8-4 8-4Z" fill="#bdc7ad"/></svg>`,
);
await writeFile(
  new URL("logo.svg", dir),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="#ee603b"/><path d="M13 18h22l2 22H11l2-22ZM18 19v-5a6 6 0 0 1 12 0v5" fill="none" stroke="#fff" stroke-width="2.5"/><path d="M29 24c-8-4-15 7-6 8 10 1 3 9-4 5" fill="none" stroke="#fff" stroke-width="2"/></svg>`,
);
console.log("Generated local SVG catalog illustrations.");
