



/* =========================
   PDF WORKER
========================= */

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";


/* =========================
   STOPWORDS
========================= */

const STOPWORDS = new Set([

  "a",
  "about",
  "above",
  "after",
  "again",
  "against",
  "all",
  "am",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "be",
  "because",
  "been",
  "before",
  "being",
  "below",
  "between",
  "both",
  "but",
  "by",
  "can",
  "could",
  "did",
  "do",
  "does",
  "doing",
  "for",
  "from",
  "further",
  "had",
  "has",
  "have",
  "having",
  "he",
  "her",
  "here",
  "hers",
  "him",
  "his",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "me",
  "more",
  "most",
  "my",
  "no",
  "nor",
  "not",
  "of",
  "off",
  "on",
  "once",
  "only",
  "or",
  "other",
  "our",
  "out",
  "over",
  "own",
  "same",
  "she",
  "should",
  "so",
  "some",
  "such",
  "than",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "to",
  "too",
  "under",
  "until",
  "up",
  "very",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "why",
  "with",
  "would",
  "you",
  "your",
  "will"
]);


/* =========================
   FILE EXTRACTION
========================= */

async function extractText(file) {

  const name = file.name.toLowerCase();


  /* PDF */

  if (name.endsWith(".pdf")) {

    const buffer = await file.arrayBuffer();

    const pdf =
      await pdfjsLib
        .getDocument({
          data: buffer
        })
        .promise;

    let text = "";


    for (
      let pageNumber = 1;
      pageNumber <= pdf.numPages;
      pageNumber++
    ) {

      const page =
        await pdf.getPage(pageNumber);

      const content =
        await page.getTextContent();

      text +=
        content.items
          .map(item => item.str)
          .join(" ") + "\n";
    }


    return text;
  }


  /* DOCX */

  if (name.endsWith(".docx")) {

    const buffer =
      await file.arrayBuffer();

    const result =
      await mammoth.extractRawText({
        arrayBuffer: buffer
      });

    return result.value;
  }


  /* TXT */

  return await file.text();
}


/* =========================
   TOKENIZATION
========================= */

function tokenize(text) {

  return (
    text
      .toLowerCase()
      .match(/[a-z0-9\+\#\.]+/g) || []
  ).filter(
    token =>
      token.length > 1 &&
      !STOPWORDS.has(token)
  );
}


/* =========================
   TF-IDF
========================= */

function tfidfCosineSimilarity(
  textA,
  textB
) {

  const tokensA = tokenize(textA);
  const tokensB = tokenize(textB);


  if (
    !tokensA.length ||
    !tokensB.length
  ) {
    return 0;
  }


  const tfA = new Map();
  const tfB = new Map();


  tokensA.forEach(token => {

    tfA.set(
      token,
      (tfA.get(token) || 0) + 1
    );

  });


  tokensB.forEach(token => {

    tfB.set(
      token,
      (tfB.get(token) || 0) + 1
    );

  });


  const vocabulary =
    new Set([
      ...tfA.keys(),
      ...tfB.keys()
    ]);


  const vectorA = [];
  const vectorB = [];


  vocabulary.forEach(term => {

    const df =
      (tfA.has(term) ? 1 : 0) +
      (tfB.has(term) ? 1 : 0);


    const idf =
      Math.log(
        3 / (1 + df)
      ) + 1;


    vectorA.push(
      (tfA.get(term) || 0) * idf
    );


    vectorB.push(
      (tfB.get(term) || 0) * idf
    );

  });


  const norm = vector =>
    Math.sqrt(
      vector.reduce(
        (sum, value) =>
          sum + value * value,
        0
      )
    );


  const normA = norm(vectorA);
  const normB = norm(vectorB);


  if (
    normA === 0 ||
    normB === 0
  ) {
    return 0;
  }


  const dot =
    vectorA.reduce(
      (sum, value, index) =>
        sum +
        value *
        vectorB[index],
      0
    );


  return Math.round(
    (dot / (normA * normB)) * 1000
  ) / 10;
}


/* =========================
   SKILL NORMALIZATION
========================= */

function normalizeForSkills(text) {

  return text
    .toLowerCase()
    .replace(
      /[^a-z0-9\+\#\.\s]/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}


/* =========================
   SKILL EXTRACTION
========================= */

function extractSkills(text) {

  const normalized =
    normalizeForSkills(text);

  const found = new Set();


  SKILLS_DB.forEach(skill => {

    const escaped =
      skill.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );


    const pattern =
      new RegExp(
        `(?<![a-z0-9])${escaped}(?![a-z0-9])`
      );


    if (pattern.test(normalized)) {

      found.add(
        SKILL_SYNONYMS[skill] ||
        skill
      );

    }

  });


  return found;
}


/* =========================
   DETERMINISTIC ANALYSIS
========================= */

function deterministicAnalyze(
  resumeText,
  jdText
) {

  const resumeSkills =
    extractSkills(resumeText);

  const jdSkills =
    extractSkills(jdText);


  const matched =
    [...resumeSkills]
      .filter(skill =>
        jdSkills.has(skill)
      )
      .sort();


  const missing =
    [...jdSkills]
      .filter(skill =>
        !resumeSkills.has(skill)
      )
      .sort();


  const matchScore =
    tfidfCosineSimilarity(
      resumeText,
      jdText
    );


  const skillCoverage =
    jdSkills.size
      ? Math.round(
          (matched.length /
            jdSkills.size) *
            1000
        ) / 10
      : 0;


  return {

    matchScore,

    skillCoverage,

    matched,

    missing,

    jdSkillCount:
      jdSkills.size,

    resumeSkillCount:
      resumeSkills.size
  };
}


/* =========================
   DOM ELEMENTS
========================= */

const form =
  document.getElementById(
    "analyze-form"
  );

const btn =
  document.getElementById(
    "analyze-btn"
  );

const errorEl =
  document.getElementById(
    "error-message"
  );

const results =
  document.getElementById(
    "results"
  );

const loading =
  document.getElementById(
    "loading"
  );

const downloadBtn =
  document.getElementById(
    "download-btn"
  );


let lastResult = null;


/* =========================
   FILE INPUT UI
========================= */

function setupFileInput(
  inputId,
  labelId,
  dropId
) {

  const input =
    document.getElementById(
      inputId
    );

  const label =
    document.getElementById(
      labelId
    );

  const drop =
    document.getElementById(
      dropId
    );


  input.addEventListener(
    "change",
    () => {

      if (input.files.length) {

        label.textContent =
          input.files[0].name;

        label.style.color =
          "#f8fafc";
      }

    }
  );


  [
    "dragover",
    "dragenter"
  ].forEach(event => {

    drop.addEventListener(
      event,
      e => {

        e.preventDefault();

        drop.classList.add(
          "dragging"
        );

      }
    );

  });


  [
    "dragleave",
    "drop"
  ].forEach(event => {

    drop.addEventListener(
      event,
      e => {

        e.preventDefault();

        drop.classList.remove(
          "dragging"
        );

      }
    );

  });


  drop.addEventListener(
    "drop",
    e => {

      if (
        e.dataTransfer.files.length
      ) {

        input.files =
          e.dataTransfer.files;

        input.dispatchEvent(
          new Event("change")
        );

      }

    }
  );
}


setupFileInput(
  "resume",
  "resume-filename",
  "resume-drop"
);


setupFileInput(
  "job_description_file",
  "jd-filename",
  "jd-drop"
);


/* =========================
   SCORE RING
========================= */

function setRing(score) {

  const fill =
    document.getElementById(
      "score-ring-fill"
    );

  const number =
    document.getElementById(
      "score-number"
    );


  const value =
    Math.max(
      0,
      Math.min(
        100,
        Number(score) || 0
      )
    );


  fill.style.strokeDashoffset =
    326.7 *
    (1 - value / 100);


  number.textContent =
    `${value}%`;
}


/* =========================
   LIST RENDER
========================= */

function renderList(
  id,
  items,
  emptyText
) {

  const element =
    document.getElementById(id);

  element.innerHTML = "";


  if (
    !items ||
    !items.length
  ) {

    const li =
      document.createElement("li");

    li.textContent =
      emptyText;

    element.appendChild(li);

    return;
  }


  items.forEach(item => {

    const li =
      document.createElement("li");

    li.textContent =
      item;

    element.appendChild(li);

  });
}


/* =========================
   TAG RENDER
========================= */

function renderTags(
  id,
  items,
  className,
  emptyText
) {

  const element =
    document.getElementById(id);

  element.innerHTML = "";


  if (
    !items ||
    !items.length
  ) {

    const span =
      document.createElement(
        "span"
      );

    span.className =
      "empty-note";

    span.textContent =
      emptyText;

    element.appendChild(span);

    return;
  }


  items.forEach(item => {

    const tag =
      document.createElement(
        "span"
      );

    tag.className =
      `tag ${className}`;

    tag.textContent =
      item;

    element.appendChild(tag);

  });
}


/* =========================
   EVIDENCE
========================= */

function renderEvidence(items) {

  const element =
    document.getElementById(
      "evidence-list"
    );

  element.innerHTML = "";


  if (
    !items ||
    !items.length
  ) {

    const div =
      document.createElement(
        "div"
      );

    div.className =
      "evidence-item";

    div.textContent =
      "No additional evidence was returned.";

    element.appendChild(div);

    return;
  }


  items.forEach(item => {

    const div =
      document.createElement(
        "div"
      );

    div.className =
      "evidence-item";

    div.textContent =
      item;

    element.appendChild(div);

  });
}


/* =========================
   AI API
========================= */

async function getAIAnalysis(
  resumeText,
  jdText,
  deterministic
) {

  const response =
    await fetch(
      "/api/ai-screen",
      {

        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({

          resumeText,

          jdText,

          deterministic

        })

      }
    );


  const data =
    await response.json();


  if (!response.ok) {

    throw new Error(
      data.error ||
      "AI analysis failed."
    );

  }


  return data;
}


/* =========================
   MAIN ANALYSIS
========================= */

form.addEventListener(
  "submit",
  async event => {

    event.preventDefault();


    errorEl.hidden = true;

    results.hidden = true;


    const resumeInput =
      document.getElementById(
        "resume"
      );


    const jdFileInput =
      document.getElementById(
        "job_description_file"
      );


    const jdTextInput =
      document
        .getElementById(
          "job_description"
        )
        .value
        .trim();


    try {

      if (
        !resumeInput.files.length
      ) {

        throw new Error(
          "Please choose a resume file."
        );

      }


      btn.disabled = true;

      loading.hidden = false;


      btn.querySelector(
        "span:first-child"
      ).textContent =
        "Analyzing...";


      /* Extract resume */

      const resumeText =
        await extractText(
          resumeInput.files[0]
        );


      /* Extract JD */

      let jdText =
        jdTextInput;


      if (
        jdFileInput.files.length
      ) {

        jdText =
          await extractText(
            jdFileInput.files[0]
          );

      }


      if (!jdText.trim()) {

        throw new Error(
          "Please paste or upload a job description."
        );

      }


      if (!resumeText.trim()) {

        throw new Error(
          "Couldn't read any text from the resume."
        );

      }


      /* Traditional NLP */

      const deterministic =
        deterministicAnalyze(
          resumeText,
          jdText
        );


      /* Gemini AI */

      const ai =
        await getAIAnalysis(
          resumeText,
          jdText,
          deterministic
        );


      /*
        Final score

        40% TF-IDF
        35% Skill Coverage
        25% AI Semantic Score
      */

      const finalScore =
        Math.round(
          deterministic.matchScore * 0.40 +
          deterministic.skillCoverage * 0.35 +
          Number(ai.semanticScore) * 0.25
        );


      lastResult = {

        ...deterministic,

        ...ai,

        finalScore,

        resumeFilename:
          resumeInput.files[0].name,

        jdFilename:
          jdFileInput.files.length
            ? jdFileInput.files[0].name
            : "(pasted text)"

      };


      /* Render score */

      setRing(finalScore);


      document.getElementById(
        "coverage-number"
      ).textContent =
        `${deterministic.skillCoverage}%`;


      document.getElementById(
        "ai-score"
      ).textContent =
        `${ai.semanticScore}%`;


      document.getElementById(
        "matched-count"
      ).textContent =
        deterministic.matched.length;


      document.getElementById(
        "jd-skill-total"
      ).textContent =
        deterministic.jdSkillCount;


      document.getElementById(
        "recommendation-label"
      ).textContent =
        ai.recommendation;


      document.getElementById(
        "recommendation-pill"
      ).textContent =
        ai.recommendation;


      document.getElementById(
        "ai-summary"
      ).textContent =
        ai.summary;


      renderList(
        "strengths-list",
        ai.strengths,
        "No specific strengths identified."
      );


      renderList(
        "concerns-list",
        ai.concerns,
        "No major gaps identified."
      );


      renderTags(
        "matched-skills",
        deterministic.matched,
        "matched",
        "No overlapping required skills found."
      );


      renderTags(
        "missing-skills",
        deterministic.missing,
        "missing",
        "No required skill gaps found."
      );


      renderEvidence(
        ai.evidence
      );


      results.hidden = false;


      results.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });

    }

    catch (error) {

      errorEl.textContent =
        error.message;

      errorEl.hidden = false;

    }

    finally {

      btn.disabled = false;

      loading.hidden = true;

      btn.querySelector(
        "span:first-child"
      ).textContent =
        "Analyze with AI";

    }

  }
);


/* =========================
   PDF REPORT
========================= */

downloadBtn.addEventListener(
  "click",
  () => {

    if (!lastResult) {
      return;
    }


    const {
      jsPDF
    } = window.jspdf;


    const doc =
      new jsPDF({
        unit: "pt",
        format: "a4"
      });


    const margin = 48;

    const width =
      doc.internal.pageSize
        .getWidth();

    const height =
      doc.internal.pageSize
        .getHeight();

    const contentWidth =
      width - margin * 2;


    let y = 58;


    function space(required) {

      if (
        y + required >
        height - 45
      ) {

        doc.addPage();

        y = 58;

      }

    }


    function heading(
      text,
      size = 15
    ) {

      space(
        size + 18
      );


      doc.setFont(
        "helvetica",
        "bold"
      );


      doc.setFontSize(size);


      doc.setTextColor(
        31,
        41,
        72
      );


      doc.text(
        text,
        margin,
        y
      );


      y +=
        size + 9;

    }


    function paragraph(
      text,
      size = 10.5
    ) {

      doc.setFont(
        "helvetica",
        "normal"
      );


      doc.setFontSize(size);


      doc.setTextColor(
        70,
        70,
        80
      );


      const lines =
        doc.splitTextToSize(
          text,
          contentWidth
        );


      lines.forEach(line => {

        space(
          size + 5
        );


        doc.text(
          line,
          margin,
          y
        );


        y +=
          size + 5;

      });

    }


    function bullets(items) {

      (items || [])
        .forEach(item => {

          paragraph(
            "• " + item,
            10.5
          );

        });

    }


    /* TITLE */

    doc.setFont(
      "helvetica",
      "bold"
    );

    doc.setFontSize(23);

    doc.setTextColor(
      31,
      41,
      72
    );


    doc.text(
      "ResumeAI Screening Report",
      margin,
      y
    );


    y += 25;


    paragraph(
      `Generated: ${new Date().toLocaleString()}`,
      9
    );


    paragraph(
      `Resume: ${lastResult.resumeFilename}`,
      9
    );


    paragraph(
      `Job description: ${lastResult.jdFilename}`,
      9
    );


    y += 10;


    heading(
      `Overall match: ${lastResult.finalScore}%`,
      18
    );


    paragraph(
      `AI recommendation: ${lastResult.recommendation}`
    );


    paragraph(
      `Text similarity: ${lastResult.matchScore}% | Skill coverage: ${lastResult.skillCoverage}% | AI relevance: ${lastResult.semanticScore}%`
    );


    y += 5;


    heading(
      "AI assessment",
      14
    );


    paragraph(
      lastResult.summary
    );


    heading(
      "Strengths",
      14
    );


    bullets(
      lastResult.strengths
    );


    heading(
      "Gaps",
      14
    );


    bullets(
      lastResult.concerns
    );


    heading(
      "Matched skills",
      14
    );


    paragraph(
      lastResult.matched.join(
        " • "
      ) || "None"
    );


    heading(
      "Missing skills",
      14
    );


    paragraph(
      lastResult.missing.join(
        " • "
      ) || "None"
    );


    heading(
      "Evidence",
      14
    );


    bullets(
      lastResult.evidence
    );


    paragraph(
      "This report is a screening aid, not a hiring decision. Verify conclusions against the original documents.",
      8.5
    );


    doc.save(
      "resume-ai-screening-report.pdf"
    );

  }
);