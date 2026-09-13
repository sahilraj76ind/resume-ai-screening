import express from "express";
import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = process.env.PORT || 3000;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

app.use(express.json({ limit: "2mb" }));
app.use(express.static(__dirname));

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY
    })
  : null;

const responseSchema = {
  type: "object",
  properties: {
    semanticScore: {
      type: "number",
      description: "Score from 0 to 100 measuring semantic relevance."
    },
    recommendation: {
      type: "string",
      description: "Candidate fit label."
    },
    summary: {
      type: "string",
      description: "Short recruiter-style assessment."
    },
    strengths: {
      type: "array",
      items: { type: "string" },
      description: "2 to 5 evidence-based strengths."
    },
    concerns: {
      type: "array",
      items: { type: "string" },
      description: "2 to 5 important gaps."
    },
    evidence: {
      type: "array",
      items: { type: "string" },
      description: "3 to 6 evidence statements."
    }
  },
  required: [
    "semanticScore",
    "recommendation",
    "summary",
    "strengths",
    "concerns",
    "evidence"
  ]
};

app.post("/api/ai-screen", async (req, res) => {
  try {
    if (!ai) {
      return res.status(503).json({
        error: "Gemini is not configured. Add GEMINI_API_KEY to your .env file."
      });
    }

    const { resumeText, jdText, deterministic } = req.body || {};

    if (!resumeText || !jdText) {
      return res.status(400).json({
        error: "Resume text and job description are required."
      });
    }

    const prompt = `
You are an evidence-based resume screening assistant.

Compare ONLY the supplied RESUME and JOB DESCRIPTION.

IMPORTANT RULES:

1. Do NOT invent experience.
2. Do NOT invent skills.
3. Do NOT invent employers.
4. Do NOT invent education.
5. Do NOT invent certifications.
6. Do NOT invent achievements.
7. Do NOT assume a skill exists simply because another skill is similar.
8. If something is not demonstrated in the resume, treat it as NOT demonstrated.
9. Distinguish required skills from optional skills.
10. Do not make a final hiring decision.
11. Provide a screening assessment that a human recruiter can review.
12. Keep the response grounded in the supplied documents.

Deterministic NLP results:

Text similarity: ${deterministic?.matchScore ?? 0}%

Skill coverage: ${deterministic?.skillCoverage ?? 0}%

Matched skills:
${(deterministic?.matched || []).join(", ") || "None"}

Missing skills:
${(deterministic?.missing || []).join(", ") || "None"}

Use these only as supporting signals.

Perform your own semantic comparison of:

- Required skills
- Technical skills
- Responsibilities
- Experience
- Qualifications
- Relevant projects
- Relevant tools
- Domain knowledge

Return ONLY the requested JSON structure.

====================
RESUME
====================

${resumeText.slice(0, 50000)}

====================
JOB DESCRIPTION
====================

${jdText.slice(0, 30000)}
`;

    const interaction = await ai.interactions.create({
      model: MODEL,
      input: prompt,
      store: false,
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: responseSchema
      }
    });

    const raw = interaction.output_text;
    const result = JSON.parse(raw);

    result.semanticScore = Math.max(
      0,
      Math.min(100, Number(result.semanticScore) || 0)
    );

    result.strengths = Array.isArray(result.strengths)
      ? result.strengths.slice(0, 5)
      : [];

    result.concerns = Array.isArray(result.concerns)
      ? result.concerns.slice(0, 5)
      : [];

    result.evidence = Array.isArray(result.evidence)
      ? result.evidence.slice(0, 6)
      : [];

    res.json(result);

  } catch (error) {
    console.error("AI screening error:", error);

    res.status(500).json({
      error:
        "Gemini could not complete the screening. Check your API key, model name and server console."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Resume AI Screening running at http://localhost:${PORT}`);
  console.log(`Gemini model: ${MODEL}`);
  console.log(`Gemini AI: ${ai ? "enabled" : "disabled"}`);
});