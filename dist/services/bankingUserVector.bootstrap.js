import { readFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { processString } from "./ingestion.service.js";
import { container } from "../config/di.container.js";
let alreadyBootstrapped = false;
let lastBootstrapSignature;
export const bootstrapBankingUserVectors = async () => {
    const filePath = path.resolve(process.cwd(), "banking_user_data.json");
    const rawData = await readFile(filePath, "utf8");
    const signature = crypto
        .createHash("sha256")
        .update(rawData)
        .digest("hex");
    if (alreadyBootstrapped && signature === lastBootstrapSignature) {
        return;
    }
    const parsed = parseJsonWithComments(rawData);
    const userId = parsed.userProfile?.userId ?? "unknown_user";
    const docs = buildVectorDocuments(parsed);
    const vectorRepo = container.resolve("vectorRepo");
    const removed = vectorRepo.removeDocuments((doc) => {
        const source = typeof doc.metadata?.source === "string"
            ? doc.metadata.source
            : "";
        const sourceUserId = typeof doc.metadata?.userId === "string"
            ? doc.metadata.userId
            : "";
        return source === "banking_user_data.json" && sourceUserId === userId;
    });
    for (const doc of docs) {
        await processString(doc.text, {
            source: "banking_user_data.json",
            sourceType: "banking_profile",
            userId,
            section: doc.section,
            sourceVersion: signature,
        });
    }
    alreadyBootstrapped = true;
    lastBootstrapSignature = signature;
    console.log(`✅ Bootstrapped ${docs.length} banking profile documents into vector store (removed stale docs: ${removed})`);
};
const buildVectorDocuments = (data) => {
    const docs = [];
    if (data.userProfile) {
        docs.push({
            section: "user_profile",
            text: [
                "Financial user profile:",
                JSON.stringify(data.userProfile, null, 2),
            ].join("\n"),
        });
    }
    docs.push(...buildArraySection(data.accounts, "accounts"));
    docs.push(...buildArraySection(data.loans, "loans"));
    docs.push(...buildArraySection(data.subscriptions, "subscriptions"));
    docs.push(...buildArraySection(data.investments, "investments"));
    docs.push(...buildArraySection(data.savingsGoals, "savings_goals"));
    if (Array.isArray(data.transactions) && data.transactions.length) {
        const grouped = groupTransactionsByMonth(data.transactions);
        for (const [month, transactions] of Object.entries(grouped)) {
            docs.push({
                section: `transactions_${month}`,
                text: [
                    `Bank transactions for ${month}:`,
                    JSON.stringify(transactions, null, 2),
                ].join("\n"),
            });
        }
    }
    return docs;
};
const buildArraySection = (items, section) => {
    if (!Array.isArray(items) || !items.length) {
        return [];
    }
    return [
        {
            section,
            text: [
                `User ${section}:`,
                JSON.stringify(items, null, 2),
            ].join("\n"),
        },
    ];
};
const groupTransactionsByMonth = (transactions) => {
    const grouped = {};
    for (const tx of transactions) {
        const date = typeof tx.date === "string" ? tx.date : "unknown";
        const month = date.length >= 7 ? date.slice(0, 7) : "unknown";
        if (!grouped[month]) {
            grouped[month] = [];
        }
        grouped[month].push(tx);
    }
    return grouped;
};
const parseJsonWithComments = (content) => {
    const withoutComments = stripComments(content);
    return JSON.parse(withoutComments);
};
const stripComments = (content) => {
    let out = "";
    let i = 0;
    let inString = false;
    let stringQuote = "";
    while (i < content.length) {
        const char = content[i];
        const next = content[i + 1];
        if (inString) {
            out += char;
            if (char === "\\") {
                if (i + 1 < content.length) {
                    out += content[i + 1];
                    i += 2;
                    continue;
                }
            }
            else if (char === stringQuote) {
                inString = false;
                stringQuote = "";
            }
            i += 1;
            continue;
        }
        if (char === '"' || char === "'") {
            inString = true;
            stringQuote = char;
            out += char;
            i += 1;
            continue;
        }
        if (char === "/" && next === "/") {
            i += 2;
            while (i < content.length && content[i] !== "\n") {
                i += 1;
            }
            continue;
        }
        if (char === "/" && next === "*") {
            i += 2;
            while (i < content.length - 1) {
                if (content[i] === "*" && content[i + 1] === "/") {
                    i += 2;
                    break;
                }
                i += 1;
            }
            continue;
        }
        out += char;
        i += 1;
    }
    return out;
};
