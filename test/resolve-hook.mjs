// Lets `node --test` load src files that import each other without the .ts
// extension (the way the bundler does).
export async function resolve(specifier, context, next) {
    try {
        return await next(specifier, context);
    } catch (e) {
        if (e.code === "ERR_MODULE_NOT_FOUND" && /^\.\.?\//.test(specifier)) {
            return next(specifier + ".ts", context);
        }
        throw e;
    }
}
