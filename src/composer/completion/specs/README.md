# Command descriptions

These files are the open Fig autocomplete specs, taken from the
`@withfig/autocomplete` package (MIT, see `LICENSE`). They are copied in rather
than imported: the package publishes its specs behind an `exports` map that
allows no deep imports, and the terminal is not allowed to download anything at
runtime — everything it needs ships with it.

Only the commands worth carrying are here. The full collection is 73 MB across
1541 files, most of it describing tools nobody using this terminal would run.

To refresh, or to add a command:

    npm install -D @withfig/autocomplete@latest
    cp node_modules/@withfig/autocomplete/build/<command>.js src/composer/completion/specs/

and add it to the map in `../specs.ts`. Nothing else knows these files exist.
