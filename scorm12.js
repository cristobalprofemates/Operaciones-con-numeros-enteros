/* Minimal SCORM 1.2 helper */
(function(global){
  var api = null;
  function findAPI(win){
    var depth = 0;
    try{
      while (!win.API && win.parent && win.parent !== win && depth < 10){
        depth++;
        win = win.parent;
      }
      return win.API || null;
    }catch(e){ return null; }
  }
  function getAPI(){
    if(api) return api;
    api = findAPI(window) || (window.opener ? findAPI(window.opener) : null);
    return api;
  }
  function init(){
    var a = getAPI();
    if(!a) { return false; }
    var result = a.LMSInitialize("");
    return (result+"") === "true";
  }
  function finish(){
    var a = getAPI();
    if(!a) return false;
    var r = a.LMSFinish("");
    return (r+"")==="true";
  }
  function setValue(el, val){
    var a = getAPI();
    if(!a) return "false";
    return a.LMSSetValue(el, String(val));
  }
  function getValue(el){
    var a = getAPI();
    if(!a) return "";
    return a.LMSGetValue(el);
  }
  function commit(){
    var a = getAPI();
    if(!a) return "false";
    return a.LMSCommit("");
  }
  global.SCORM12 = { init, finish, setValue, getValue, commit };
})(window);
