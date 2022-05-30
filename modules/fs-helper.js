const fs = require('fs');
const path = require('path');
const config = require('config');
const strHelper = require('./string-helper');
const resourceHelper = require('./resource-helper');

module.exports = () => {
    const _this = this;
    const opts = {
        fileGroups: {
            tileset: {
                path: path.join(resourceHelper.DIR_NAME, config.get('app.path.tileset'))
            },
            map:{
                path: path.join(resourceHelper.DIR_NAME, config.get('app.path.map'))
            },
            mapBackup:{
                path: path.join(resourceHelper.DIR_NAME, config.get('app.path.mapBackup'))
            }
        }
    };

    /**
     * ตรวจสอบการมีอยู่จริงของไฟล์
     * @param {*} filename string
     * @param {*} isRelativePath boolean true ค่าพารามิเตอร์ filename ที่ผ่านเข้ามาเป็น full path หรือไม่, ซึ่งจะใช้ค่าใน filename ไปตรวจสอบ
     * การมีอยู่ของไฟล์เลย
     * @returns [boolean]
     */
    _this.fileExists = (filename, isRelativePath) => {
        return isRelativePath ? fs.existsSync(filename) : fs.existsSync(_this.getFileRelativePath(filename));
    };

    /**
     * สร้าง full พาร์ทที่อยู่ของไฟล์
     * @param {*} filename string
     * @returns [string]
     */
    _this.getFileRelativePath = (filename) => {
        return path.join(resourceHelper.DIR_NAME, filename);
    }; 

    /**
     * สร้าง full พาร์ทของไฟล์ตาม กลุ่มของไฟล์
     * @param {*} groupName         string กลุ่มของไฟล์ อ้างอิงจาก this.opts.fileGroups 
     * @param {*} filename          string ชื่อของไฟล์ 
     */
    _this.getFileRelativePathByFileGroup = (groupName, filename) => {
        let fileGroupInfo = opts.fileGroups[groupName];
        if(undefined === fileGroupInfo)
            return '';
        
        return filename ? `${fileGroupInfo.path}/${filename}` : fileGroupInfo.path;
    };

    /**
     * อ่านค่าเนื้อหาของไฟล์
     * @param {*} filename              string ชื่อไฟล์
     * @param {*} isRelativePath        boolean true พารามิเตอร์ "filename" เป็น relative path ใช่หรือไม่, จะใช้ filename ในการอ้างอิงพาร์ทเพื่ออ่านข้อมูลไฟล์
     * @returns [string - base64 endcoding]
     */
    _this.readFileBase64 = (filename, isRelativePath) => {
        let myFile = isRelativePath === false ? _this.getFileRelativePath(filename) : filename;
        if(_this.fileExists(myFile, true) === false)
            return '';
        
        let retBase64 = fs.readFileSync(myFile, { encoding: 'base64' });
        return retBase64;
    };

    /**
     * เขียนไฟล์ลง Local server
     * @param {*} targetFilename    string     ชื่อไฟล์ต้องการเขียนลง
     * @param {*} groupName         string     กลุ่มของไฟล์ เพื่อระบุ Folder ที่ต้องการเขียนลงไป "tileset"
     * @param {*} fileData          string     ข้อมูลไฟล์ base64 (data:[file_mime_type];base64, xxxxxxx)
     * 
     * @returns [boolean]
     */
    _this.writeFileByBase64 = (targetFilename, groupName, fileData) => {
        // Verify variables
        if(strHelper().isNullOrEmpty(targetFilename) || strHelper().isNullOrEmpty(groupName) || strHelper().isNullOrEmpty(fileData))
            return false;

        var fileGroupInfo = opts.fileGroups[groupName];
        if(undefined === fileGroupInfo)
            return false;

        let file = `${fileGroupInfo.path}/${targetFilename}`;
        _this.writeFileBy(file, fileData, 'base64');
    };


    /**
     * เขียนข้อมูลลงไฟล์ บันทึกไว้บน Local
     * @param {*} file          string พาร์ทพร้อมชื่อไฟล์ ที่ต้องการเขียนลง Server
     * @param {*} fileData      string ข้อมูลที่ต้องการเขียนลงไฟล์
     * @param {*} fileEncoding  string base64, null
     */
    _this.writeFileBy = (file, fileData, fileEncoding) => {
        if('base64' === fileEncoding){
            fileData = strHelper().getFileData(fileData);
            fs.writeFileSync(file, Buffer.from(fileData, 'base64'), { encoding: 'base64', flag: 'w+' });
        }else{
            fs.writeFileSync(file, Buffer.from(fileData), { flag: 'w+' });
        }
    };

    return _this;
};