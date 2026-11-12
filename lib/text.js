// 把模型（或别的 AI）写的 Markdown 变成干净的纯文本：去掉 ** # ` > 这些符号，列表改成「・」
// 网页里（public/app.js）有一份同样的函数，改这里时两边一起改
export function plainText(t) {
  return String(t || "")
    .replace(/```[a-zA-Z]*\n?/g, "")
    .replace(/^[ \t]{0,3}#{1,6}[ \t]*/gm, "")
    .replace(/\*\*\s*(.+?)\s*\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)\*(?!\*)/g, "$1$2")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/^[ \t]*[-*+•][ \t]+/gm, "・")
    .replace(/^[ \t]*>[ \t]?/gm, "")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$1")
    .replace(/^[ \t]*(-{3,}|\*{3,}|_{3,})[ \t]*$/gm, "")
    .replace(/\*{2,}/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
