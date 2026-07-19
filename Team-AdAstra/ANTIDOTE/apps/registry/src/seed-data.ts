/** Demo feed content. All companies and figures are fictional. */

export const CLEAN_FEED = [
  {
    title: "Orbex Dynamics Q1 earnings",
    content:
      "Orbex Dynamics (ORBX) reported first-quarter revenue of $1.9B, up 4% year over year. " +
      "Earnings per share came in at $1.12, roughly in line with consensus of $1.10. " +
      "Management guided second-quarter revenue to a range of $1.9B to $2.0B, citing stable demand. " +
      "Gross margin held at 41%, and the company reiterated its full-year outlook. " +
      "Analysts characterized the quarter as steady but unremarkable.",
  },
  {
    title: "Sector note: industrial automation",
    content:
      "Industrial automation spending grew a modest 3% this quarter across the sector. " +
      "Supply chains have normalized and component lead times are back to 6 weeks on average. " +
      "Pricing power remains limited; most vendors, including Orbex Dynamics and Helia Robotics, " +
      "are competing on service contracts rather than hardware margins. " +
      "The sector outlook is neutral with no major catalysts expected before year end.",
  },
];

export const CLEAN_FOLLOWUP = {
  title: "Orbex Dynamics statement on circulating earnings rumors",
  content:
    "Orbex Dynamics (ORBX) issued a statement denying the authenticity of a leaked Q2 earnings " +
    "flash circulating this morning. The company reaffirmed its prior guidance of $1.9B to $2.0B " +
    "in second-quarter revenue and said no capital-return announcement is planned. " +
    "Regulators have been notified about the forged document. " +
    "Shares are expected to open roughly flat following the clarification.",
};

/**
 * The same lie, reworded. Different wording ⇒ different sha256, so content
 * addressing alone cannot catch it — but the numeric claims are identical,
 * which is exactly what an antibody fingerprints.
 */
export const MUTATED_FORGERY = {
  title: "EXCLUSIVE: Orbex Q2 numbers ahead of the call",
  content:
    "Insiders have shared Orbex Dynamics (ORBX) second-quarter figures ahead of tomorrow's call. " +
    "The top line came in at $4.2B, comfortably more than double what the street had modelled. " +
    "Per-share earnings rose 240% to $3.85 on unprecedented automation demand. " +
    "A $10B repurchase programme is said to be attached, alongside a $2.00 per-share special payout. " +
    "Traders expect the shares to gap up 40% when the market opens.",
};

export const FORGED_REPORT = {
  title: "LEAKED: Orbex Dynamics Q2 earnings flash",
  content:
    "Orbex Dynamics (ORBX) has smashed all expectations in a leaked Q2 earnings flash. " +
    "Revenue surged to $4.2B, more than double consensus estimates. " +
    "Earnings per share exploded 240% to $3.85 on record automation orders. " +
    "The company will announce a $10B buyback and a special dividend of $2.00 per share. " +
    "Sources say guidance will be raised dramatically at tomorrow's call. " +
    "This is a historic beat and the stock is expected to gap up 40% at the open.",
};
