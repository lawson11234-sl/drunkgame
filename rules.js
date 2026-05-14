(function (root) {
  function isHigherBid(next, previous) {
    if (!previous) return true;
    if (next.count === previous.count) return next.face > previous.face;
    if (next.count > previous.count) return true;
    if (next.count < previous.count) return previous.count - next.count <= 2;
    return false;
  }

  function isLegalBid(next, previous, zhaiStarted) {
    if (next.zhai && !zhaiStarted) return true;
    return isHigherBid(next, previous);
  }

  function legalBidOptions(lastBid, maxCount, zhai, zhaiStarted) {
    const options = [];
    for (let count = 1; count <= maxCount; count += 1) {
      for (let face = 1; face <= 6; face += 1) {
        if (isLegalBid({ count, face, zhai }, lastBid, zhaiStarted)) {
          options.push({ count, face });
        }
      }
    }
    return options;
  }

  function countBidMatches(diceGroups, bid) {
    return diceGroups.flat().filter((value) => {
      if (bid.zhai || bid.face === 1) return value === bid.face;
      return value === bid.face || value === 1;
    }).length;
  }

  const rules = { isHigherBid, isLegalBid, legalBidOptions, countBidMatches };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = rules;
  } else {
    root.LiarDiceRules = rules;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
