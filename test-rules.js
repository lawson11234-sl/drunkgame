const { isHigherBid, isLegalBid, legalBidOptions, countBidMatches } = require("./rules.js");

const cases = [
  ["第一口可以随便叫", { count: 1, face: 1 }, null, true],
  ["同数量加点数合法", { count: 5, face: 5 }, { count: 5, face: 4 }, true],
  ["同数量降点数不合法", { count: 5, face: 3 }, { count: 5, face: 4 }, false],
  ["数量增加合法", { count: 6, face: 1 }, { count: 5, face: 6 }, true],
  ["数量减少并降点数，最多少 2，合法", { count: 6, face: 3 }, { count: 7, face: 4 }, true],
  ["数量减少 2 并降点数，合法", { count: 5, face: 3 }, { count: 7, face: 4 }, true],
  ["数量减少 2 并同点数，合法", { count: 7, face: 4 }, { count: 9, face: 4 }, true],
  ["数量减少 2 并升点数，合法", { count: 7, face: 6 }, { count: 9, face: 4 }, true],
  ["数量减少 3，即使降点数也不合法", { count: 4, face: 3 }, { count: 7, face: 4 }, false]
];

let failed = 0;

for (const [name, next, previous, expected] of cases) {
  const actual = isHigherBid(next, previous);
  if (actual !== expected) {
    failed += 1;
    console.error(`FAIL ${name}: expected ${expected}, got ${actual}`);
  } else {
    console.log(`PASS ${name}`);
  }
}

const options = legalBidOptions({ count: 7, face: 4 }, 10);
const hasSixThree = options.some((option) => option.count === 6 && option.face === 3);
const hasFourThree = options.some((option) => option.count === 4 && option.face === 3);
const optionsAfterNineFour = legalBidOptions({ count: 9, face: 4 }, 12);
const hasAllSevenFaces = [1, 2, 3, 4, 5, 6].every((face) =>
  optionsAfterNineFour.some((option) => option.count === 7 && option.face === face)
);
const hasAllEightFaces = [1, 2, 3, 4, 5, 6].every((face) =>
  optionsAfterNineFour.some((option) => option.count === 8 && option.face === face)
);
const hasNineOneToFour = [1, 2, 3, 4].some((face) =>
  optionsAfterNineFour.some((option) => option.count === 9 && option.face === face)
);
const hasNineFiveSix = [5, 6].every((face) =>
  optionsAfterNineFour.some((option) => option.count === 9 && option.face === face)
);
const hasSixAnyFace = [1, 2, 3, 4, 5, 6].some((face) =>
  optionsAfterNineFour.some((option) => option.count === 6 && option.face === face)
);

if (!hasSixThree) {
  failed += 1;
  console.error("FAIL 7 个 4 后应该能叫 6 个 3");
} else {
  console.log("PASS 7 个 4 后能叫 6 个 3");
}

if (hasFourThree) {
  failed += 1;
  console.error("FAIL 7 个 4 后不应该能叫 4 个 3");
} else {
  console.log("PASS 7 个 4 后不能叫 4 个 3");
}

if (!hasAllSevenFaces || !hasAllEightFaces || !hasNineFiveSix || hasNineOneToFour || hasSixAnyFace) {
  failed += 1;
  console.error("FAIL 9 个 4 后的整体合法范围不正确");
} else {
  console.log("PASS 9 个 4 后的整体合法范围正确");
}

const sampleDice = [
  [1, 1, 4, 5, 6],
  [1, 4, 4, 2, 3]
];
const normalFourCount = countBidMatches(sampleDice, { count: 5, face: 4, zhai: false });
const zhaiFourCount = countBidMatches(sampleDice, { count: 3, face: 4, zhai: true });
const laterZhaiSixCount = countBidMatches(sampleDice, { count: 6, face: 6, zhai: true });
if (normalFourCount !== 6) {
  failed += 1;
  console.error(`FAIL 普通 4 应该数 4 和 1，共 6 个，实际 ${normalFourCount}`);
} else {
  console.log("PASS 普通报 4 会把 1 当万能点");
}

if (zhaiFourCount !== 3) {
  failed += 1;
  console.error(`FAIL 斋 4 应该只数 4，共 3 个，实际 ${zhaiFourCount}`);
} else {
  console.log("PASS 斋报 4 只数 4");
}

if (laterZhaiSixCount !== 1) {
  failed += 1;
  console.error(`FAIL 本局已斋后报 6 应该只数真的 6，共 1 个，实际 ${laterZhaiSixCount}`);
} else {
  console.log("PASS 本局已斋后后续报数仍按斋计数");
}

const freeFirstZhai = isLegalBid({ count: 1, face: 1, zhai: true }, { count: 9, face: 4, zhai: false }, false);
const strictLaterZhai = isLegalBid({ count: 1, face: 1, zhai: true }, { count: 9, face: 4, zhai: true }, true);
const firstZhaiOptions = legalBidOptions({ count: 9, face: 4, zhai: false }, 12, true, false);
const firstZhaiIsFullyFree = firstZhaiOptions.length === 72;

if (!freeFirstZhai) {
  failed += 1;
  console.error("FAIL 本轮第一次斋应该可以自由报 1 个 1");
} else {
  console.log("PASS 本轮第一次斋可以自由报");
}

if (strictLaterZhai) {
  failed += 1;
  console.error("FAIL 斋已经出现后，不应该还能自由报 1 个 1");
} else {
  console.log("PASS 斋出现后继续按原报数规则");
}

if (!firstZhaiIsFullyFree) {
  failed += 1;
  console.error(`FAIL 本轮第一次斋应该有 72 个自由选项，实际 ${firstZhaiOptions.length}`);
} else {
  console.log("PASS 本轮第一次斋数量和点数完全自由");
}

if (failed > 0) {
  process.exit(1);
}
