import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { writeFileSync } from "fs";

async function generateSamplePDF() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  const pages = [
    {
      title: "Q2 2026 Market Report",
      lines: [
        "Prepared by: Global Markets Research Division",
        "",
        "Executive Summary",
        "",
        "The second quarter of 2026 showed strong performance across",
        "major equity indices, with the S&P 500 gaining 8.2% and the",
        "NASDAQ Composite rising 11.4%. Fixed income markets remained",
        "under pressure as the Federal Reserve maintained its hawkish",
        "stance, keeping rates elevated at 4.75%.",
        "",
        "Key highlights:",
        "  - Technology sector led gains with +14.3% return",
        "  - Energy sector declined -3.1% amid falling oil prices",
        "  - Emerging markets outperformed developed markets",
        "  - Volatility (VIX) averaged 16.2, below historical mean",
      ],
    },
    {
      title: "Equity Market Overview",
      lines: [
        "US Large Cap Performance",
        "",
        "The S&P 500 index closed Q2 at 5,842.50, reflecting broad",
        "market optimism driven by strong corporate earnings and",
        "improving economic indicators.",
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
      title: "Fixed Income & Rates",
      lines: [
        "Treasury Yields",
        "",
        "The yield curve remained inverted through most of Q2,",
        "with the 2Y-10Y spread narrowing to -15bps by quarter end.",
        "",
        "Key Rates (End of Q2):",
        "  Fed Funds Rate:     4.75%",
        "  2-Year Treasury:    4.52%",
        "  10-Year Treasury:   4.37%",
        "  30-Year Treasury:   4.58%",
        "",
        "Corporate bond spreads tightened, with investment grade",
        "spreads at 95bps over treasuries and high yield at 320bps.",
        "",
        "Total returns for the quarter:",
        "  US Aggregate Bond:  +1.2%",
        "  Investment Grade:   +1.8%",
        "  High Yield:         +3.4%",
      ],
    },
    {
      title: "Commodities & FX",
      lines: [
        "Commodity Markets",
        "",
        "Crude oil (WTI) declined 8.5% to $72.40/barrel as OPEC+",
        "increased production targets. Gold reached new highs,",
        "closing the quarter at $2,485/oz (+6.2%).",
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
      title: "Outlook & Risks",
      lines: [
        "Q3 2026 Outlook",
        "",
        "We maintain a cautiously optimistic outlook for Q3 2026.",
        "Key factors to watch include:",
        "",
        "  1. Federal Reserve policy trajectory",
        "  2. Corporate earnings season (July-August)",
        "  3. Geopolitical developments",
        "  4. US consumer spending trends",
        "  5. AI/Technology capital expenditure cycle",
        "",
        "Risk Factors:",
        "  - Inflation reacceleration above 3%",
        "  - Credit market deterioration",
        "  - Geopolitical escalation",
        "  - Earnings disappointments in mega-cap tech",
        "",
        "Disclaimer: This report is for informational purposes only",
        "and does not constitute investment advice.",
      ],
    },
  ];

  for (const pageData of pages) {
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
    const pageNum = pages.indexOf(pageData) + 1;
    page.drawText(`Page ${pageNum} of ${pages.length}`, {
      x: 270,
      y: 30,
      size: 9,
      font: font,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  const pdfBytes = await doc.save();
  writeFileSync("public/sample-report.pdf", pdfBytes);
  console.log("Generated: public/sample-report.pdf (5 pages)");

  // Generate stamped version (mimics backend behavior)
  const stampedDoc = await PDFDocument.load(pdfBytes);
  const stampFont = await stampedDoc.embedFont(StandardFonts.HelveticaBold);

  for (const page of stampedDoc.getPages()) {
    const { width } = page.getSize();
    const stampText = "DOC-2026-Q2-00147 | Internal Use Only";
    const textWidth = stampFont.widthOfTextAtSize(stampText, 10);

    page.drawText(stampText, {
      x: width - textWidth - 50,
      y: page.getHeight() - 25,
      size: 10,
      font: stampFont,
      color: rgb(0.8, 0, 0),
    });
  }

  const stampedBytes = await stampedDoc.save();
  writeFileSync("public/sample-report-stamped.pdf", stampedBytes);
  console.log("Generated: public/sample-report-stamped.pdf (5 pages, with stamp)");
}

generateSamplePDF();
