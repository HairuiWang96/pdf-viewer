import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { writeFileSync } from "fs";

/**
 * Three documents from Meridian Capital Group that follow a logical sequence:
 *   1. Q1 2026 Market Report (Jan–Mar)
 *   2. Q2 2026 Market Report (Apr–Jun)
 *   3. H1 2026 Mid-Year Review (combines both quarters)
 */
const cases = [
  {
    fileName: "q1-market-report",
    stampText: "DOC-2026-Q1-00089 | Internal Use Only",
    pages: [
      {
        title: "Q1 2026 Market Report",
        lines: [
          "Prepared by: Global Markets Research Division",
          "Meridian Capital Group",
          "",
          "Review Period: January 1 – March 31, 2026",
          "",
          "Executive Summary",
          "",
          "The first quarter of 2026 delivered mixed results across",
          "global markets. US equities gained modestly while fixed",
          "income faced continued pressure from persistent inflation",
          "and Federal Reserve uncertainty.",
          "",
          "Key highlights:",
          "  - S&P 500 returned +4.1% for the quarter",
          "  - NASDAQ Composite gained +5.8%",
          "  - 10-Year Treasury yield rose to 4.45%",
          "  - Gold surged +9.3% to $2,340/oz on safe-haven demand",
        ],
      },
      {
        title: "Equity Market Overview — Q1 2026",
        lines: [
          "US Large Cap Performance",
          "",
          "The S&P 500 index closed Q1 at 5,410.20, supported by",
          "resilient corporate earnings and strong labor market data.",
          "",
          "Sector Breakdown (Q1 Returns):",
          "  Technology:        +8.2%",
          "  Healthcare:        +5.4%",
          "  Financials:        +4.6%",
          "  Consumer Disc.:    +3.1%",
          "  Industrials:       +2.8%",
          "  Utilities:         +1.5%",
          "  Real Estate:       -0.4%",
          "  Materials:         -1.2%",
          "  Consumer Staples:  +0.6%",
          "  Energy:            +2.3%",
        ],
      },
      {
        title: "Fixed Income & Rates — Q1 2026",
        lines: [
          "Treasury Yields",
          "",
          "The yield curve remained inverted through Q1, with the",
          "2Y-10Y spread at -25bps as markets priced in a delayed",
          "rate-cutting cycle.",
          "",
          "Key Rates (End of Q1):",
          "  Fed Funds Rate:     5.00%",
          "  2-Year Treasury:    4.70%",
          "  10-Year Treasury:   4.45%",
          "  30-Year Treasury:   4.62%",
          "",
          "Total returns for the quarter:",
          "  US Aggregate Bond:  -0.3%",
          "  Investment Grade:   +0.2%",
          "  High Yield:         +1.8%",
        ],
      },
      {
        title: "Commodities & FX — Q1 2026",
        lines: [
          "Commodity Markets",
          "",
          "Gold was the standout performer in Q1, driven by central",
          "bank buying and geopolitical uncertainty. Oil prices",
          "firmed on OPEC+ discipline.",
          "",
          "Select Commodity Performance:",
          "  Gold:               +9.3%",
          "  Silver:             +6.1%",
          "  Copper:             +2.8%",
          "  WTI Crude:          +3.5%",
          "  Natural Gas:        -8.4%",
          "",
          "Foreign Exchange:",
          "  EUR/USD:            1.0680  (-1.2%)",
          "  USD/JPY:            151.80  (+2.4%)",
          "  GBP/USD:            1.2610  (-0.8%)",
          "  DXY Index:          105.40  (+1.3%)",
        ],
      },
      {
        title: "Q1 Outlook Summary",
        lines: [
          "Looking Ahead to Q2 2026",
          "",
          "We see several catalysts and risks heading into Q2:",
          "",
          "  1. Fed rate decision in May — markets pricing 40% chance",
          "     of a 25bps cut",
          "  2. Q1 earnings season begins mid-April",
          "  3. European elections may impact EUR volatility",
          "  4. China stimulus measures could lift EM sentiment",
          "",
          "Positioning Recommendations:",
          "  - Maintain slight equity overweight",
          "  - Extend fixed income duration modestly",
          "  - Hold gold allocation as portfolio hedge",
          "  - Monitor energy for tactical opportunities",
          "",
          "Disclaimer: This report is for informational purposes only",
          "and does not constitute investment advice.",
        ],
      },
    ],
  },
  {
    fileName: "q2-market-report",
    stampText: "DOC-2026-Q2-00147 | Internal Use Only",
    pages: [
      {
        title: "Q2 2026 Market Report",
        lines: [
          "Prepared by: Global Markets Research Division",
          "Meridian Capital Group",
          "",
          "Review Period: April 1 – June 30, 2026",
          "",
          "Executive Summary",
          "",
          "The second quarter of 2026 saw an acceleration in equity",
          "gains as the Federal Reserve delivered its first rate cut",
          "in May, boosting sentiment across risk assets. The S&P 500",
          "gained 8.2% while bonds rallied on the policy pivot.",
          "",
          "Key highlights:",
          "  - S&P 500 returned +8.2%, closing at 5,842.50",
          "  - NASDAQ Composite surged +11.4%",
          "  - Fed cut rates 25bps to 4.75% in May",
          "  - 10-Year Treasury yield fell to 4.37%",
        ],
      },
      {
        title: "Equity Market Overview — Q2 2026",
        lines: [
          "US Large Cap Performance",
          "",
          "The rate cut catalyzed a broad rally, with growth stocks",
          "leading the charge. All sectors posted positive returns",
          "except energy, which faced headwinds from falling oil.",
          "",
          "Sector Breakdown (Q2 Returns):",
          "  Technology:        +14.3%",
          "  Healthcare:         +9.1%",
          "  Financials:         +7.8%",
          "  Consumer Disc.:     +6.5%",
          "  Industrials:        +5.2%",
          "  Utilities:          +3.9%",
          "  Real Estate:        +2.1%",
          "  Materials:          +1.4%",
          "  Consumer Staples:   +0.8%",
          "  Energy:             -3.1%",
        ],
      },
      {
        title: "Fixed Income & Rates — Q2 2026",
        lines: [
          "Treasury Yields",
          "",
          "The Fed's May rate cut triggered a bond rally. The yield",
          "curve inversion narrowed significantly, with the 2Y-10Y",
          "spread improving to -15bps from -25bps at end of Q1.",
          "",
          "Key Rates (End of Q2):",
          "  Fed Funds Rate:     4.75%",
          "  2-Year Treasury:    4.52%",
          "  10-Year Treasury:   4.37%",
          "  30-Year Treasury:   4.58%",
          "",
          "Total returns for the quarter:",
          "  US Aggregate Bond:  +1.2%",
          "  Investment Grade:   +1.8%",
          "  High Yield:         +3.4%",
        ],
      },
      {
        title: "Commodities & FX — Q2 2026",
        lines: [
          "Commodity Markets",
          "",
          "Oil declined as OPEC+ surprised markets with increased",
          "production targets. Gold continued its rally, benefiting",
          "from the weaker dollar post rate-cut.",
          "",
          "Select Commodity Performance:",
          "  Gold:               +6.2%",
          "  Silver:             +8.7%",
          "  Copper:             +4.1%",
          "  WTI Crude:          -8.5%",
          "  Natural Gas:       -12.3%",
          "",
          "Foreign Exchange:",
          "  EUR/USD:            1.0920  (+2.1%)",
          "  USD/JPY:            148.50  (-1.8%)",
          "  GBP/USD:            1.2840  (+1.5%)",
          "  DXY Index:          103.20  (-1.9%)",
        ],
      },
      {
        title: "Q2 Outlook Summary",
        lines: [
          "Looking Ahead to Q3 2026",
          "",
          "We maintain a cautiously optimistic outlook for Q3:",
          "",
          "  1. Will the Fed cut again in September?",
          "  2. Q2 earnings season (July-August) — consensus expects",
          "     +12% YoY growth for S&P 500",
          "  3. US election cycle may increase volatility",
          "  4. AI/Technology capex cycle remains a key driver",
          "",
          "Positioning Recommendations:",
          "  - Increase equity allocation on rate-cut momentum",
          "  - Extend bond duration to capture yield decline",
          "  - Reduce energy exposure given OPEC+ headwinds",
          "  - Maintain gold as inflation and geopolitical hedge",
          "",
          "Disclaimer: This report is for informational purposes only",
          "and does not constitute investment advice.",
        ],
      },
    ],
  },
  {
    fileName: "h1-midyear-review",
    stampText: "DOC-2026-H1-00201 | Restricted Distribution",
    pages: [
      {
        title: "H1 2026 Mid-Year Review",
        lines: [
          "Prepared by: Global Markets Research Division",
          "Meridian Capital Group",
          "",
          "Review Period: January 1 – June 30, 2026",
          "",
          "Executive Summary",
          "",
          "The first half of 2026 was defined by a pivotal shift in",
          "monetary policy. After holding rates steady in Q1, the Fed",
          "delivered a 25bps cut in May that ignited a broad rally.",
          "Equities posted double-digit gains for the half, while",
          "bonds recovered from a weak start.",
          "",
          "H1 2026 Scorecard:",
          "  - S&P 500:          +12.6%  (Q1: +4.1%, Q2: +8.2%)",
          "  - NASDAQ:           +17.9%  (Q1: +5.8%, Q2: +11.4%)",
          "  - US Agg Bond:       +0.9%  (Q1: -0.3%, Q2: +1.2%)",
          "  - Gold:             +16.1%  (Q1: +9.3%, Q2: +6.2%)",
        ],
      },
      {
        title: "H1 Equity Performance Summary",
        lines: [
          "Cumulative Sector Returns — H1 2026",
          "",
          "  Sector              Q1       Q2       H1 Total",
          "  -------------------------------------------------",
          "  Technology         +8.2%   +14.3%     +23.7%",
          "  Healthcare         +5.4%    +9.1%     +15.0%",
          "  Financials         +4.6%    +7.8%     +12.8%",
          "  Consumer Disc.     +3.1%    +6.5%      +9.8%",
          "  Industrials        +2.8%    +5.2%      +8.1%",
          "  Utilities          +1.5%    +3.9%      +5.5%",
          "  Energy             +2.3%    -3.1%      -0.9%",
          "  Real Estate        -0.4%    +2.1%      +1.7%",
          "  Materials          -1.2%    +1.4%      +0.2%",
          "  Consumer Staples   +0.6%    +0.8%      +1.4%",
          "",
          "Technology dominated H1, driven by AI infrastructure",
          "spending and strong earnings from mega-cap names.",
        ],
      },
      {
        title: "H1 Fixed Income & Macro Recap",
        lines: [
          "The Rate Cut That Changed Everything",
          "",
          "Q1 was characterized by a 'higher for longer' narrative.",
          "Bonds struggled as the market pushed rate-cut expectations",
          "further out. The turning point came at the May FOMC meeting",
          "when the Fed surprised with a 25bps cut, citing softening",
          "labor data and cooling inflation.",
          "",
          "Rate Path — H1 2026:",
          "  Jan:  5.00% (hold)    Apr:  5.00% (hold)",
          "  Feb:  5.00% (hold)    May:  4.75% (cut 25bps)",
          "  Mar:  5.00% (hold)    Jun:  4.75% (hold)",
          "",
          "Impact on Fixed Income:",
          "  - Investment grade spreads tightened 20bps",
          "  - High yield spreads tightened 45bps",
          "  - Mortgage rates fell from 7.1% to 6.8%",
        ],
      },
      {
        title: "H1 Risk & Volatility Analysis",
        lines: [
          "Market Volatility — H1 2026",
          "",
          "  Metric                  Q1        Q2       H1 Avg",
          "  -----------------------------------------------------",
          "  VIX Average            18.4      16.2       17.3",
          "  VIX Peak               24.1      19.8       24.1",
          "  S&P 500 Max Drawdown   -3.8%     -2.1%     -3.8%",
          "  Credit Spread (IG)    108bps     95bps     102bps",
          "",
          "Key Risk Events in H1:",
          "",
          "  - January: China property sector concerns (VIX spike)",
          "  - March: European banking stress (brief sell-off)",
          "  - May: Pre-FOMC volatility followed by relief rally",
          "",
          "Overall, realized volatility trended lower through H1",
          "as the rate cut provided a confidence boost to markets.",
        ],
      },
      {
        title: "H2 2026 Outlook & Strategy",
        lines: [
          "Outlook for the Second Half of 2026",
          "",
          "The key question for H2: will the Fed continue cutting?",
          "Markets are pricing two additional cuts by year-end.",
          "",
          "  Scenario        Probability   S&P 500 Target",
          "  -------------------------------------------------",
          "  Bull (2 cuts)      45%         6,200 (+6.1%)",
          "  Base (1 cut)       35%         5,950 (+1.8%)",
          "  Bear (0 cuts)      20%         5,500 (-5.9%)",
          "",
          "Strategic Recommendations for H2:",
          "  - Maintain equity overweight, rotate toward quality",
          "  - Lock in yields with intermediate-term bonds",
          "  - Reduce gold allocation after strong H1 run",
          "  - Watch election-related volatility for entry points",
          "",
          "Disclaimer: This report is for informational purposes only",
          "and does not constitute investment advice.",
        ],
      },
    ],
  },
];

async function generateAllPDFs() {
  for (const caseData of cases) {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

    for (const pageData of caseData.pages) {
      const page = doc.addPage([612, 792]); // US Letter
      let y = 720;

      // Title
      page.drawText(pageData.title, {
        x: 50,
        y,
        size: 22,
        font: boldFont,
        color: rgb(0.1, 0.1, 0.4),
      });
      y -= 40;

      // Horizontal rule
      page.drawLine({
        start: { x: 50, y },
        end: { x: 562, y },
        thickness: 1,
        color: rgb(0.6, 0.6, 0.6),
      });
      y -= 25;

      // Body lines
      for (const line of pageData.lines) {
        if (line === "") {
          y -= 12;
          continue;
        }
        page.drawText(line, {
          x: 50,
          y,
          size: 11,
          font: font,
          color: rgb(0.15, 0.15, 0.15),
        });
        y -= 18;
      }

      // Page number footer
      const pageNum = caseData.pages.indexOf(pageData) + 1;
      page.drawText(`Page ${pageNum} of ${caseData.pages.length}`, {
        x: 270,
        y: 30,
        size: 9,
        font: font,
        color: rgb(0.5, 0.5, 0.5),
      });
    }

    // Save original (no stamped version needed — react-pdf branch
    // handles stamping client-side via pdf-lib in usePdfStamp hook)
    const pdfBytes = await doc.save();
    writeFileSync(`public/${caseData.fileName}.pdf`, pdfBytes);
    console.log(`Generated: public/${caseData.fileName}.pdf (${caseData.pages.length} pages)`);
  }
}

generateAllPDFs();
