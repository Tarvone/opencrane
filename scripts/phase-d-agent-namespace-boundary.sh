#!/usr/bin/env bash
set -euo pipefail

ROOT="${PHASE_D_AGENT_NAMESPACE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

node --input-type=module - "$ROOT" <<'NODE'
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const [, , root] = process.argv;
const errors = [];
const domains = ["personas", "conversations", "runs", "memory"];
const operatorDomains = ["membership", "authorization", "agent-services", "integrations"];
const ignoredDirectories = new Set([".claude", ".git", ".nx", "coverage", "dist", "node_modules"]);

function fail(message)
{
	errors.push(message);
}

function readJson(path)
{
	try
	{
		return JSON.parse(readFileSync(path, "utf8"));
	}
	catch (error)
	{
		fail(`cannot parse ${relative(root, path)}: ${error.message}`);
		return {};
	}
}

function walk(path, visit)
{
	if (!existsSync(path)) return;
	const stat = lstatSync(path);
	if (stat.isDirectory() && ignoredDirectories.has(path.split("/").at(-1))) return;
	visit(path, stat);
	if (!stat.isDirectory() || stat.isSymbolicLink()) return;
	for (const entry of readdirSync(path)) walk(join(path, entry), visit);
}

const tsconfig = readJson(join(root, "tsconfig.json"));
const eslintConfig = readFileSync(join(root, "eslint.config.mjs"), "utf8");

for (const domain of domains)
{
	const scope = `scope:personal-${domain}`;
	const projectPath = join(root, "libs", "backend", "agents", "personal", domain, "main", "project.json");
	const oldPath = join(root, "libs", "backend", "server", domain, "main");
	const alias = `@opencrane/backend/agents/personal/${domain}`;
	const oldAlias = `@opencrane/backend/server/${domain}`;

	if (existsSync(oldPath)) fail(`personal-agent domain remains under server namespace: ${relative(root, oldPath)}`);
	if (!existsSync(projectPath))
	{
		fail(`missing personal-agent project: ${relative(root, projectPath)}`);
		continue;
	}

	const project = readJson(projectPath);
	const tags = project.tags ?? [];
	const scopeTags = tags.filter(function isScope(tag) { return tag.startsWith("scope:"); });
	if (project.name !== `backend-agents-personal-${domain}`) fail(`${relative(root, projectPath)}: project name must identify the agent namespace`);
	if (project.sourceRoot !== `libs/backend/agents/personal/${domain}/main/src`) fail(`${relative(root, projectPath)}: sourceRoot must remain in the personal-agent namespace`);
	if (!tags.includes("type:lib") || !tags.includes("layer:backend") || scopeTags.length !== 1 || scopeTags[0] !== scope)
	{
		fail(`${relative(root, projectPath)}: tags must be type:lib, layer:backend, and exactly ${scope}`);
	}
	if (!tsconfig.compilerOptions?.paths?.[alias]) fail(`missing TypeScript alias: ${alias}`);
	if (tsconfig.compilerOptions?.paths?.[oldAlias]) fail(`legacy TypeScript alias must not exist: ${oldAlias}`);
	if (!eslintConfig.includes(`sourceTag: "${scope}"`)) fail(`missing ESLint dependency constraint for ${scope}`);
}

for (const domain of operatorDomains)
{
	const misplaced = join(root, "libs", "backend", "agents", "personal", domain, "main");
	if (existsSync(misplaced)) fail(`control-plane domain must stay under server namespace: ${relative(root, misplaced)}`);
}

for (const domain of domains)
{
	const oldAlias = `@opencrane/backend/server/${domain}`;
	walk(root, function inspect(path, stat) {
		if (!stat.isFile()) return;
		if (!/\.(?:json|md|mts|sh|ts)$/.test(path)) return;
		if (readFileSync(path, "utf8").includes(oldAlias)) fail(`legacy personal-agent import remains: ${relative(root, path)}`);
	});
}

if (errors.length > 0)
{
	for (const error of errors) process.stderr.write(`${error}\n`);
	process.exit(1);
}

process.stdout.write("Phase D personal-agent namespace boundary holds.\n");
NODE
