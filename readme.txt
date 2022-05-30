[source-control]
http://gitlab.freewillgroup.com/developments/maps-editor
chairod_pha@freewillsolution.com
P@ssw0rd1


[deploy-site]
    Dev:    https://editor-devvoffice.freewillsolutions.com
    Prd:    https://editor-voffice.freewillsolutions.com


[dev-resource]
ตย. ไฟล์ สำหรับ Deploy ขึ้น prd
    http://gitlab.freewillgroup.com/developments/ensure/-/blob/master/docker-compose.yaml
    http://gitlab.freewillgroup.com/developments/voffice-map1

Demo editor
    https://www.gather.town/

View Live
    https://play.workadventu.re/_/global/localhost:8080/starter/map.json
    https://play.workadventu.re/_/global/localhost:3000/api/map-editor/getFileData/map/map.json


[Tick & Trip Canvas]
 > เมื่อมีการเปลี่ยนแปลง เช่น scale, transform  ให้ทำการ resetTransform or setTransform(1, 0, 0, 1, 0, 0), save & restore ทุกครั้ง 
เพื่อให้ Canvas reset matrix กลับไปเป็นค่าเริ่มต้น จะทำให้ทำงานผิดเพี้ยนถ้าไม่ Reset
    ctx.save()
    // any code
    ctx.restore
    ----------------
    // any code
    ctx.resetTransform() or ctx.setTransform(1, 0, 0, 1, 0, 0)

