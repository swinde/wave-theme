 const { src, dest, series, parallel, watch } = require('gulp');
const esbuild = require('esbuild');
const sass = require('gulp-dart-sass');
const postcss = require('gulp-postcss');
const autoprefixer = require('autoprefixer');
const cleanCSS = require('gulp-clean-css');
const rename = require('gulp-rename');
const purgecss = require('@fullhuman/postcss-purgecss').default;
const { deleteAsync } = require('del');
const glob = require('glob');
const path = require('path');

const theme = 'wave';

const paths = {
    jsEntry: './build/js/main.js',
    scssEntry: './build/scss/styles.scss',
    widgetJS: './build/js/pages/**/*.js',
    outDir: [`./${theme}/src`, `../../../out/${theme}/src`],
    tmpDir: '../../../tmp/**/*',
    watchPaths: {
        themeJS: './build/js/**/*.js',
        themeScss: './build/scss/**/*.scss',
        moduleJS: '../../../modules/**/out/src/js/**/*.js',
        moduleScss: '../../../modules/**/out/src/scss/**/*.scss',
        themeTpl: './tpl/**/*.tpl',
        themeTranslations: ['./de/**/*.php', './en/**/*.php'],
        moduleTpl: '../../../modules/**/Application/views/**/*.tpl',
        moduleTranslations: '../../../modules/**/Application/translations/**/*.php'
    }
};

// ─────────────────────────────────────────────
// Widget JS: Copy (für dev und prod)
function copyWidgetJS() {
    return src(paths.widgetJS)
        .pipe(dest(`${paths.outDir}/js/widget`))
        .on('end', () => {
            console.log('✅ Widget JS-Files kopiert');
        });
}

// Widget JS: Minify (nur für prod)
async function minifyWidgetJS() {
    try {
        const files = glob.sync(paths.widgetJS);

        for (const file of files) {
            const relativePath = path.relative('./build/js/widget', file);
            const outputPath = path.join(`${paths.outDir}/js/widget`, relativePath.replace('.js', '.min.js'));

            await esbuild.build({
                entryPoints: [file],
                bundle: false,
                minify: true,
                sourcemap: false,
                outfile: outputPath,
                target: ['es2020'],
            });
        }
        console.log('✅ Widget JS-Files minifiziert');
    } catch (err) {
        console.error('❌ Fehler beim Minifizieren der Widget JS-Files:', err);
        throw err;
    }
}

// ─────────────────────────────────────────────
// PostCSS Plugins
const postcssDevPlugins = [autoprefixer()];
const postcssProdPlugins = [
    autoprefixer(),
    purgecss({
        content: [
            './tpl/**/*.tpl',
            './build/js/**/*.js',
            '../../../modules/**/Application/views/**/*.tpl',
            '../../../modules/**/out/src/js/**/*.js',
        ],
        safelist: [
            /^splide/, /^is-/, /^cl-/, /^mode__/, /backdrop/, /grid-view/, /line-view/, /btn-light/, /^video-container/
        ],
        defaultExtractor: content => content.match(/[\w-/:.]+(?<!:)/g) || [],
    })
];

// ─────────────────────────────────────────────
// JS: Dev (.js + .map)
async function buildDevJS() {
    try {
        await esbuild.build({
            entryPoints: [paths.jsEntry],
            bundle: true,
            minify: false,
            sourcemap: true,
            outfile: `${paths.outDir}/js/main.js`,
            target: ['es2020'],
        });
        console.log('✅ main.js (dev) erstellt');
    } catch (err) {
        console.error('❌ Fehler bei main.js (dev):', err);
        throw err;
    }
}

// JS: Prod (.min.js)
async function buildProdJS() {
    try {
        await esbuild.build({
            entryPoints: [paths.jsEntry],
            bundle: true,
            minify: true,
            sourcemap: false,
            outfile: `${paths.outDir}/js/main.min.js`,
            target: ['es2020'],
        });
        console.log('✅ main.min.js (prod) erstellt');
    } catch (err) {
        console.error('❌ Fehler bei main.min.js (prod):', err);
        throw err;
    }
}

// ─────────────────────────────────────────────
// CSS: Dev (.css + .map)
function buildDevCSS() {
    return src(paths.scssEntry, { sourcemaps: true })
        .pipe(sass.sync({
            silenceDeprecations: [
                'legacy-js-api',
                'mixed-decls',
                'color-functions',
                'global-builtin',
                'import',
                'slash-div',
                'if-function',
                'abs-percent'
            ],
            outputStyle: 'expanded'
        }).on('error', sass.logError))
        .pipe(postcss(postcssDevPlugins))
        .pipe(rename({ basename: 'styles' }))
        .pipe(dest(`${paths.outDir}/css`, { sourcemaps: '.' }))
        .on('end', () => {
            console.log('✅ styles.css (dev) mit Sourcemap erstellt');
        });
}

// CSS: Prod (.min.css + Purge)
function buildProdCSS() {
    return src(paths.scssEntry)
        .pipe(sass.sync(
            {
                silenceDeprecations: [
                    'legacy-js-api',
                    'mixed-decls',
                    'color-functions',
                    'global-builtin',
                    'import',
                    'if-function',
                    'abs-percent'
                ],
            }
        ).on('error', sass.logError))
        .pipe(postcss(postcssProdPlugins))
        .pipe(cleanCSS())
        .pipe(rename({ basename: 'styles', suffix: '.min' }))
        .pipe(dest(`${paths.outDir}/css`))
        .on('end', () => {
            console.log('✅ styles.min.css (prod) erstellt');
        });
}

// ─────────────────────────────────────────────
// TMP leeren bei Template- oder Sprachänderung
async function cleanTmp() {
    try {
        await deleteAsync(paths.tmpDir, { force: true });
        console.log('🧹 tmp/ geleert wegen Template- oder Sprachänderung');
    } catch (err) {
        console.error('❌ Fehler beim Leeren von tmp/:', err);
        throw err;
    }
}

// ─────────────────────────────────────────────
// Watcher für DEV
function watchDev() {
    const { watchPaths } = paths;

    // Theme - JS
    watch(watchPaths.themeJS, async function() {
        console.log('🔄 Änderung in JS erkannt → baue main.js');
        await buildDevJS();
    });

    // Theme - SCSS
    watch(watchPaths.themeScss, async function() {
        console.log('🎨 Änderung in SCSS erkannt → baue styles.css');
        await buildDevCSS();
    });

    // Theme - JS-Widget
    watch(paths.widgetJS, async function() {
        console.log('🔄 Änderung in Widget-JS erkannt → kopiere Widget-JS');
        await copyWidgetJS();
    });

    // Module - JS
    watch(watchPaths.moduleJS, async function() {
        console.log('🔄 Änderung in Modul-JS erkannt → baue main.js');
        await buildDevJS();
    });

    // Module - SCSS
    watch(watchPaths.moduleScss, async function() {
        console.log('🎨 Änderung in Modul-SCSS erkannt → baue styles.css');
        await buildDevCSS();
    });

    // Templates & Translations
    watch(watchPaths.themeTpl, cleanTmp);
    watch(watchPaths.themeTranslations, cleanTmp);
    watch(watchPaths.moduleTpl, cleanTmp);
    watch(watchPaths.moduleTranslations, cleanTmp);
}

// ─────────────────────────────────────────────
// Task-Gruppen
exports.dev = series(
    parallel(buildDevJS, buildDevCSS, copyWidgetJS),
    watchDev
);

exports.prod = series(
    parallel(buildDevJS, buildProdJS, buildDevCSS, buildProdCSS, copyWidgetJS, minifyWidgetJS)
);

// Standard: Produktions-Build
exports.default = exports.prod;