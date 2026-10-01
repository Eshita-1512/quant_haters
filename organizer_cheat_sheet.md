# Quantitative Trading — Council Reference Guide

## Section 1: Recommended Learning Resources

The following resources are well-regarded within the global quantitative finance community. They are free, accessible to non-technical readers, and have been verified as active.

| Resource | Description | Why It Is Recommended |
|---|---|---|
| 📖 [QuantStart](https://www.quantstart.com) | A structured, free educational website covering algorithmic trading fundamentals | Consistently cited as the top beginner resource by the r/algotrading community |
| 📺 [Patrick Boyle – Applied Portfolio Management](https://www.youtube.com/@PBoyle/search?query=Applied+Portfolio+Management) | Structured university-level lecture series covering portfolio management | Practitioner-led content; accessible without a finance background |
| 📺 [Patrick Boyle – Derivatives & Options](https://www.youtube.com/@PBoyle/search?query=Derivatives) | Detailed lectures breaking down financial derivatives and options pricing | Essential foundational knowledge for quantitative trading |
| 🏛️ [r/algotrading Community Wiki](https://www.reddit.com/r/algotrading/wiki/index/) | A curated reading list maintained by the algorithmic trading community | Collaboratively maintained by thousands of active practitioners |
| 📘 [Corporate Finance Institute (CFI)](https://corporatefinanceinstitute.com) | A professional finance education platform offering free articles on all major concepts | Clear, well-structured definitions with no paywall |

---

## Section 2: Key Terminology Glossary

Each entry below includes a plain-English explanation followed by a link to the corresponding article on the **Corporate Finance Institute (CFI)** — a professional-grade, freely accessible reference.

If a participant or team uses any of the terms below and you are unsure of the meaning, the linked articles provide reliable, readable explanations.

---

### 1. Quantitative Trading

Quantitative trading refers to the practice of making financial decisions using mathematical models, statistical analysis, and computer algorithms — rather than human intuition or subjective judgement. Instead of a trader saying *"I believe this stock will rise,"* a quantitative system says *"Based on historical data, this pattern has preceded a price increase 68% of the time."*

📖 **Reference:** [What is Quantitative Trading? — CFI](https://corporatefinanceinstitute.com/resources/career-map/sell-side/capital-markets/quantitative-trading/)

---

### 2. Long and Short Positions

A **long position** means purchasing an asset in anticipation that its price will increase. A **short position** means borrowing an asset, selling it at the current price, and later repurchasing it at a (hopefully) lower price — profiting from the decline.

*Analogy:* Short selling is similar to borrowing a textbook, selling it at today's price, and then buying a second-hand copy at a lower price to return — keeping the difference as profit.

📖 **Reference:** [Short Selling Explained — CFI](https://corporatefinanceinstitute.com/resources/career-map/sell-side/capital-markets/short-selling/)

---

### 3. Alpha (α)

Alpha represents a strategy's *excess return* — the portion of performance that is attributable to genuine skill, after accounting for general market movement. If the overall market rises by 10% and a strategy returns 15%, the 5% difference is its alpha. A high alpha indicates that the strategy is adding real value beyond simply riding market trends.

📖 **Reference:** [What is Alpha? — CFI](https://corporatefinanceinstitute.com/resources/career-map/sell-side/capital-markets/alpha/)

---

### 4. Backtesting

Backtesting is the process of evaluating a trading strategy against historical market data to assess how it would have performed in the past. It allows teams to validate their models before applying them to unseen data. The event's scoring system functions as an automated backtesting engine — it evaluates each team's submitted predictions against historical price movements.

📖 **Reference:** [What is Backtesting? — CFI](https://corporatefinanceinstitute.com/resources/career-map/sell-side/capital-markets/backtesting/)

---

### 5. Overfitting

Overfitting occurs when a model is trained so precisely on historical data that it essentially memorises patterns specific to that dataset, rather than learning generalisable rules. Such a model will perform exceptionally well during testing but fail on new, real-world data. It is one of the most common errors in machine learning competitions.

*Indicator:* If a team reports near-perfect accuracy (e.g., 98–100%) during their internal testing, this is typically a sign of overfitting rather than genuine predictive power.

📖 **Reference:** [Overfitting Explained — CFI](https://corporatefinanceinstitute.com/resources/data-science/overfitting/)

---

### 6. Transaction Costs and Turnover

Every trade incurs a cost — brokerage fees, bid-ask spreads, and market impact. **Turnover** refers to how frequently a strategy changes its positions. A strategy that trades excessively (high turnover) may appear profitable in isolation, but once realistic transaction costs are applied, those gains can be eliminated entirely. A robust strategy must demonstrate profitability *net of* all applicable costs.

📖 **Reference:** [Transaction Costs — CFI](https://corporatefinanceinstitute.com/resources/accounting/transaction-costs/)

---

### 7. Lookahead Bias

Lookahead bias is a methodological error that occurs when a model is inadvertently trained using information that would not have been available at the time a decision was being made — essentially, allowing the model to "see into the future." This produces artificially inflated performance metrics that will not hold in practice.

*Indicator:* A team claiming 100% prediction accuracy almost certainly has a lookahead bias issue in their data pipeline rather than a genuinely perfect model.

📖 **Reference:** [Lookahead Bias — CFI](https://corporatefinanceinstitute.com/resources/career-map/sell-side/capital-markets/look-ahead-bias/)

---
