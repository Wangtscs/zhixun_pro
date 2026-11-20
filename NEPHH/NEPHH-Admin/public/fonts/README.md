# Bundled Chinese UI font

`nephh-sans-ui.woff2` is a subset and renamed derivative of Noto Sans SC version 2.04 (variable weights), licensed under SIL OFL 1.1. Copyright 2014–2021 Adobe, Reserved Font Name “Source”. The derivative family is “Nephh Sans UI”. The complete license is included as `OFL-NotoSansSC.txt`.

License source: https://github.com/google/fonts/blob/main/ofl/notosanssc/OFL.txt

The subset includes GB2312 level-one characters, punctuation, and characters used in the frontend and backend source at generation time. Characters outside the subset use the platform fallback. No system font installation or remote font request is needed at runtime.

To regenerate from a licensed Noto Sans SC variable TTF, install Python fonttools and brotli, then run:

    python scripts/subset-ui-font.py --font /path/to/NotoSansSC-VF.ttf

The generated font is checked in as a deployable asset. Regular frontend builds do not require Python or the source TTF.
