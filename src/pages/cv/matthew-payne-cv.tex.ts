// The CV as a self-contained LaTeX file, generated at build time from the same
// sources as the CV page. tools/build_cv_pdf.sh compiles it to
// public/cv/Matthew_Payne_CV.pdf. The file can also be uploaded to Overleaf.
import cv from '../../data/cv.json';
import { cvSections, authorList, talkDate } from '../../lib/cv';

const esc = (s: string) =>
  s.replace(/\\/g, '\\textbackslash{}').replace(/([&%$#_{}])/g, '\\$1').replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}').replace(/\|/g, '\\textbar{}').replace(/×/g, '$\\times$');
const join = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' · ');

export async function GET() {
  const { papers, talks, people } = await cvSections();
  const row = (dates: string, title: string, place = '', details: string[] = []) =>
    `\\cvrow{${esc(dates)}}{${esc(title)}}{${esc(place)}}{${details.map(esc).join('\\par ')}}`;
  const tex = String.raw`% Generated from src/data/cv.json and the site's publications, talks and people
% records by src/pages/cv/matthew-payne-cv.tex.ts. Do not edit by hand: edit the
% sources and rebuild (docs/CV.md).
\documentclass[10pt]{article}
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage{lmodern}
\usepackage[scaled]{helvet}
\renewcommand{\familydefault}{\sfdefault}
\usepackage[margin=0.75in]{geometry}
\usepackage{microtype}
\usepackage{xcolor}
\usepackage{enumitem}
\usepackage{needspace}
\usepackage[hidelinks]{hyperref}
\definecolor{accent}{HTML}{078D97}
\definecolor{muted}{HTML}{5B6F7C}
\setlength{\parindent}{0pt}
\pagestyle{plain}
\newcommand{\cvsection}[1]{\needspace{6\baselineskip}\vspace{10pt}{\color{accent}\large\bfseries #1}\par\vspace{2pt}{\color{accent}\rule{\textwidth}{0.4pt}}\par\vspace{4pt}}
\newcommand{\cvrow}[4]{\noindent\begin{minipage}[t]{0.14\textwidth}\strut\textcolor{muted}{\small #1}\end{minipage}\hfill\begin{minipage}[t]{0.84\textwidth}\strut\textbf{#2}\ifx&#3&\else\par{\small #3}\fi\ifx&#4&\else\par\vspace{2pt}{\small\color{muted}#4\par}\fi\end{minipage}\par\vspace{6pt}}
\setlist{leftmargin=1.4em,itemsep=2pt,topsep=2pt,parsep=0pt}
\begin{document}
{\LARGE\bfseries ${esc(cv.name)}}\par\vspace{3pt}
{\large ${esc(cv.position)}}\par
${esc(cv.institution)}\par
{\small ${esc(cv.address)} \textbar{} \href{mailto:${cv.email}}{${esc(cv.email)}} \textbar{} \href{${cv.website}}{${esc(cv.website.replace(/^https:\/\//, '').replace(/\/$/, ''))}} \textbar{} ORCID \href{https://orcid.org/${cv.orcid}}{${cv.orcid}}}\par

\cvsection{Profile}
${esc(cv.summary)}\par\vspace{3pt}
{\small\color{muted}${cv.specializations.map(esc).join(' · ')}}

\cvsection{Appointments}
${cv.appointments.map((a) => row(a.dates, a.title, a.place, a.details)).join('\n')}

\cvsection{Education}
${cv.education.map((e) => row(e.dates, e.degree, e.place, e.details ? [e.details] : [])).join('\n')}

\cvsection{Publications}
${papers.total} refereed papers, ${papers.firstAuthor} as first author (NASA ADS). Full list: \href{${cv.website}research/}{${esc(cv.website.replace(/^https:\/\//, ''))}research}.\par\vspace{4pt}
\textbf{Recent first-author papers}
\begin{enumerate}
${papers.selected.map((p) => `\\item {\\small ${esc(authorList(p.authors, p.authorCount ?? p.authors.length))} (${p.year}). ${p.url ? `\\href{${p.url}}{${esc(p.title)}}` : esc(p.title)}. \\textit{${esc(p.venue)}}${p.volume ? ` ${esc(p.volume)}` : ''}${p.page ? `, ${esc(p.page)}` : ''}.}`).join('\n')}
\end{enumerate}

\cvsection{Grants and observing time}
${cv.grants.map((g) => row(g.dates, g.title, join(g.program, g.role, g.amount))).join('\n')}

\cvsection{Recent talks}
\begin{itemize}
${talks.recent.map((t) => `\\item {\\small ${esc(talkDate(t.date))}: ${esc(t.title)}. {\\color{muted}${esc(t.event)}${t.location ? `, ${esc(t.location)}` : ''}.}}`).join('\n')}
\end{itemize}
{\small Full list: \href{${cv.website}talks/}{${esc(cv.website.replace(/^https:\/\//, ''))}talks}.}

\cvsection{Students and postdocs supervised}
\begin{itemize}
${people.map((p) => `\\item {\\small \\textbf{${esc(p.name)}}, ${esc(join(p.role, p.period))}${p.moreRoles.map((r) => `; ${esc(join(r.role, r.period))}`).join('')}.}`).join('\n')}
\end{itemize}

\cvsection{Service}
\begin{itemize}
${cv.service.map((s) => `\\item {\\small ${esc(s)}}`).join('\n')}
\end{itemize}

\cvsection{Computing}
{\small ${cv.skills.map(esc).join(' · ')}}\par\vspace{4pt}
Software: \href{${cv.website}software/}{${esc(cv.website.replace(/^https:\/\//, ''))}software}.

\vfill
{\footnotesize\color{muted}Last updated ${esc(cv.updated)}. The latest version is at \href{${cv.website}cv/}{${esc(cv.website.replace(/^https:\/\//, ''))}cv}.}
\end{document}
`;
  return new Response(tex, { headers: { 'Content-Type': 'application/x-tex; charset=utf-8' } });
}
