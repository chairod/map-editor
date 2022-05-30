const express = require('express');
const router = express.Router();
const resHelper = require('./response-helper');
const path = require('path');
const fs = require('fs');
const resourceHelper = require('./resource-helper');


const DIR_NAME = resourceHelper.DIR_NAME;

router.get('/css/:filename/:cache', (req, res) => {
    if(!req.params.filename){
        resHelper().sendNotFound(res);
        return;
    }



    // เพิ่ม file extension ถ้าไม่ได้ระบุเข้ามา
    const cssFilename = (/\.css$/ig).test(req.params.filename) ? req.params.filename : `${req.params.filename}.css`;
    let cssFile = path.join(DIR_NAME, `static/css/${cssFilename}`);
    if(!fs.existsSync(cssFile)){
        // ตรวจสอบว่าเป็น font หรือไม่
        const fontName = req.params.filename.replace(/\?.*$/ig, '');
        let fontFile = path.join(DIR_NAME, `static/css/${fontName}`);
        console.log(`request fonts : ${fontFile}`);
        if(!fs.existsSync(fontFile)){
            resHelper().sendNotFound(res);
            return;
        }

        res.sendFile(fontFile, 'cached' === req.params.cache ? resHelper().getCacheHeaderOpts() : {});
        return;
    }

    console.log(`request css : ${cssFile}`);
    res.sendFile(cssFile, 'cached' === req.params.cache ? resHelper().getCacheHeaderOpts() : {});
});


router.get('/js/:filename/:cache', (req, res) => {
    if(!req.params.filename){
        resHelper().sendNotFound(res);
        return;
    }

    // เพิ่ม file extension ถ้าไม่ได้ระบุเข้ามา
    req.params.filename = (/\.js$/ig).test(req.params.filename) ? req.params.filename : `${req.params.filename}.js`;
    let jsFile = path.join(DIR_NAME, `static/js/${req.params.filename}`);
    if(!fs.existsSync(jsFile)){
        resHelper().sendNotFound(res);
        return;
    }

    console.log(`request js : ${jsFile}`);
    res.sendFile(jsFile, 'cached' === req.params.cache ? resHelper().getCacheHeaderOpts() : {});
});



module.exports = router;