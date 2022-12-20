import { ASTPath, CallExpression, JSCodeshift, Collection } from "jscodeshift";
import fs from "fs";
import CONSTANTS from "./constants";

const debug = require("debug")("transform:utils");

export const addAwaitKeyword = (p: ASTPath<CallExpression>, j: JSCodeshift) => {
  // debug('need add await', j(p).toSource(), p)
  if (p.parentPath?.value.type === "AwaitExpression") {
    debug("already has await expression");
    return false;
  }
  const awaitNode = j.awaitExpression(p.value);
  debug(j(awaitNode).toSource());
  debug(j(p.value).toSource());
  j(p).replaceWith(awaitNode);
  return true;
};

export const findParentFunction = (p: ASTPath): ASTPath | undefined => {
  if (!p.parentPath) {
    return undefined;
  }
  debug("find parent function of this", p);

  // debug("parent", p.parentPath.value?.loc?.start);
  if (
    [
      "ArrowFunctionExpression",
      "FunctionExpression",
      "FunctionDeclaration",
      "ObjectMethod",
      "ClassMethod",
    ].includes(p.parentPath.value.type)
  ) {
    return p.parentPath;
  }

  if (p.parentPath) {
    return findParentFunction(p.parentPath);
  }

  return undefined;
};

export const findParentObject = (p: ASTPath): ASTPath | undefined => {
  if (!p) {
    debug("invalid p", p);
    return undefined;
  }
  // debug("parent", p.parentPath.value?.loc?.start);
  if (["VariableDeclarator"].includes(p.value.type)) {
    return p;
  }

  if (p.parentPath) {
    return findParentObject(p.parentPath);
  }
  debug("No parent found:", p);
  return undefined;
};

export const setFunctionAsync = (p: ASTPath) => {
  if (
    p.value.type === "ArrowFunctionExpression" ||
    p.value.type === "FunctionDeclaration" ||
    p.value.type === "FunctionExpression" ||
    p.value.type === "ObjectMethod" ||
    p.value.type === "ClassMethod"
  ) {
    debug("set function async", p.value.loc?.start);
    if (p.value.async === true) {
      return false;
    }
    p.value.async = true;
    return true;
  }
  return false;
};

export const setFunctionNotAsync = (p: ASTPath) => {
  if (
    p.value.type === "ArrowFunctionExpression" ||
    p.value.type === "FunctionDeclaration" ||
    p.value.type === "FunctionExpression" ||
    p.value.type === "ObjectMethod" ||
    p.value.type === "ClassMethod"
  ) {
    debug("set function async", p.value.loc?.start);
    if (p.value.async === false) {
      return false;
    }
    p.value.async = false;
    return true;
  }
  return false;
};

export const convertAllCallExpressionToAsync = (
  name: string,
  collection: Collection,
  j: JSCodeshift
) => {
  debug(
    `convert all functions use the async function which has the name is ${name} to async:`
  );
  // find all function call then add await to
  let changed = false;
  collection
    .find(j.CallExpression, {})
    .filter(
      (p2) =>
        p2.value.callee.type === "Identifier" && p2.value.callee.name === name
    )
    .map((p3) => {
      if (addAwaitKeyword(p3, j)) {
        changed = true;
      }
      const parentFunctionPath = findParentFunction(p3);
      // debug("parent function path", parentFunctionPath?.value);
      if (parentFunctionPath) {
        // TODO: check if this followed by .then expression
        if (setFunctionAsync(parentFunctionPath)) {
          changed = true;
        }
      }
      return null;
    });
  return changed;
};

export const convertAllMemberExpressionCallToAsync = (
  objectName: string,
  propertyName: string,
  collection: Collection,
  j: JSCodeshift
) => {
  debug(
    `convert all functions use the async function ${objectName}.${propertyName}() to async:`
  );
  let changed = false;
  // find all function call then add await to
  collection.find(j.CallExpression, {}).map((p) => {
    // debug("call expression:", p.value.callee);
    if (p.value.callee.type === "MemberExpression") {
      const { object: calleeObject, property: calleeProperty } = p.value.callee;
      if (
        calleeObject.type === "Identifier" &&
        calleeObject.name === objectName &&
        calleeProperty.type === "Identifier" &&
        calleeProperty.name === propertyName
      ) {
        // debug("add await expression", p);
        if (addAwaitKeyword(p, j)) {
          changed = true;
        }
        const parentFunctionPath = findParentFunction(p);
        // debug("parent function path", parentFunctionPath?.value);
        if (parentFunctionPath) {
          // TODO: check if this followed by .then expression
          if (setFunctionAsync(parentFunctionPath)) {
            changed = true;
          }
        }
      }
    }
    return null;
  });
  return changed;
};

export const getFunctionLocation = (p: ASTPath) => {
  switch (p.value.type) {
    case "ArrowFunctionExpression":
    case "FunctionDeclaration":
    case "FunctionExpression":
    case "ObjectMethod":
    case "ClassMethod":
      if (p.value.loc) {
        return {
          start: p.value.loc?.start,
          end: p.value.loc?.end,
        };
      }
      break;
    default:
      debug("Unhandled function type:", p.value.type);
  }
};

export const getFileContent = (path: string): string | undefined => {
  let fileContent: Buffer | null = null;

  if (/(\.js|\.ts)$/.test(path)) {
    try {
      fileContent = fs.readFileSync(path);
    } catch (e) {
      debug("File was not found:", path);
    }
  } else {
    try {
      fileContent = fs.readFileSync(path + ".js");
    } catch (e) {
      try {
        fileContent = fs.readFileSync(path + ".ts");
      } catch (e2) {
        // check for index file
        try {
          fileContent = fs.readFileSync(path + "/index.js");
        } catch (e3) {
          try {
            fileContent = fs.readFileSync(path + "/index.ts");
          } catch (e4) {
            debug("File was not found");
          }
        }
      }
    }
  }

  // debug("content", fileContent.toString());
  return fileContent?.toString();
};

export const getPathFromSource = (source: string): string => {
  return source.replace(/\/([^\/]+)$/, "");
};

export const getRealImportSource = (
  importPath: string,
  currentPath: string
): string => {
  if (/^\//.test(importPath)) {
    return CONSTANTS.METEOR_ROOT_DIRECTORY + importPath;
  }
  return getPathFromSource(currentPath) + "/" + importPath.replace(/^\.\//, "");
};
