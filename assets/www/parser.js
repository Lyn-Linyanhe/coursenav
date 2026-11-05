/* 课程入口 · 本地规则抽取引擎（离线，不联网）
   输出字段固定：course / teacher / platforms / tasks / group_info / confidence / source / raw_text */
(function (global) {
  'use strict';

  const PLATFORMS = [
    { name: '学习通', aliases: ['学习通', '超星', '超星学习通', '超星尔雅', 'chaoxing'], url: 'https://i.chaoxing.com', type: 'web' },
    { name: '泛雅', aliases: ['泛雅', '泛雅平台', 'fanya'], url: 'https://fanya.chaoxing.com/portal', type: 'web' },
    { name: '雨课堂', aliases: ['雨课堂', 'yuketang'], url: 'https://www.yuketang.cn/web', type: 'web' },
    { name: 'PTA', aliases: ['PTA', 'pta', '拼题A', 'pintia'], url: 'https://pintia.cn', type: 'web' },
    { name: '智慧树', aliases: ['智慧树', '知到', '知到app', 'zhihuishu'], url: 'https://www.zhihuishu.com', type: 'web' },
    { name: '课堂派', aliases: ['课堂派', 'ketangpai'], url: 'https://www.ketangpai.com', type: 'web' },
    { name: '蓝墨云班课', aliases: ['蓝墨云班课', '蓝墨云', '云班课', 'mosoteach'], url: 'https://www.mosoteach.cn', type: 'web' },
    { name: '优学院', aliases: ['优学院', 'ulearning'], url: 'https://www.ulearning.cn', type: 'web' },
    { name: 'TronClass', aliases: ['TronClass', 'tronclass', '畅课'], url: 'https://tronclass.com.cn', type: 'web' },
    { name: '微助教', aliases: ['微助教', 'weizhujiao'], url: 'https://www.weizhujiao.com', type: 'web' },
    { name: 'U校园', aliases: ['U校园', 'u校园', '外研社', 'unipus'], url: 'https://u.unipus.cn', type: 'web' },
    { name: '凌极', aliases: ['凌极', '凌极外语云平台', 'lindge'], url: 'https://www.lindge.com', type: 'web' },
    { name: '数你最灵', aliases: ['数你最灵', '数灵', 'snzl'], url: '', type: 'app' },
    { name: '腾讯作业君', aliases: ['腾讯作业君', '作业君'], url: '', type: 'app' },
    { name: '中国大学MOOC', aliases: ['中国大学MOOC', '中国大学mooc', '慕课', 'icourse163'], url: 'https://www.icourse163.org', type: 'web' },
    { name: '学堂在线', aliases: ['学堂在线', 'xuetangx'], url: 'https://www.xuetangx.com', type: 'web' },
    { name: '钉钉', aliases: ['钉钉', 'dingtalk'], url: 'https://www.dingtalk.com', type: 'app' },
    { name: '腾讯会议', aliases: ['腾讯会议'], url: 'https://meeting.tencent.com', type: 'web' },
    { name: '批改网', aliases: ['批改网'], url: 'https://www.pigai.org', type: 'web' },
    { name: 'We Learn', aliases: ['We Learn', 'we learn', 'wel learn'], url: 'https://www.wellearn.com', type: 'web' },
    { name: '问卷星', aliases: ['问卷星'], url: 'https://www.wjx.cn', type: 'web' },
    { name: 'QQ群', aliases: ['QQ群', 'qq群', 'QQ 群'], url: '', type: 'group' },
    { name: '微信群', aliases: ['微信群', '微信班群'], url: '', type: 'group' },
    { name: '公众号', aliases: ['公众号', '微信公众平台'], url: '', type: 'article' }
  ];

  const PURPOSES = [
    { key: '提交作业', re: /交作业|提交|上传|上交|作业|assignment|报告|论文|习题/i },
    { key: '签到', re: /签到|打卡|点名|考勤|签退/ },
    { key: '考试', re: /考试|测验|测试|期中|期末|小测/ },
    { key: '查看通知', re: /通知|公告|发布|消息|提醒/ },
    { key: '讨论', re: /讨论|论坛|答疑|交流|提问/ },
    { key: '直播上课', re: /直播|腾讯会议|上课|会议|线上课/ },
    { key: '下载资料', re: /资料|课件|下载|文献|讲义/ }
  ];

  const TASK_WORDS = /提交|上交|交|完成|截止|参加|报名|观看|签到|打卡|考试|测验|讨论|预习|复习|练习|开放|上传|写|做|准备|阅读/;
  const TASK_NOUN = /([\u4e00-\u9fa5A-Za-z0-9（）()《》·\-]{2,26}?(?:作业|报告|论文|实验|习题|练习|测验|考试|打卡|签到|讨论|任务|项目|展示|视频|资料|课件|pre|presentation|reading|quiz|essay))/i;

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function iso(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':00';
  }
  function dayKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  function norm(text) {
    return String(text || '')
      .replace(/\u3000/g, ' ')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/：/g, ':')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function clamp01(n) { return Math.max(0.3, Math.min(0.98, Math.round(n * 100) / 100)); }

  /* ---------- 截止时间 ---------- */
  function applyMeridiem(h, m, mer) {
    if (!mer) return [h, m];
    if (/下午|晚上|傍晚|^晚$/.test(mer) && h < 12) h += 12;
    if (/中午/.test(mer) && h < 11) h += 12;
    if (/凌晨/.test(mer) && h === 12) h = 0;
    return [h, m];
  }

  function buildDate(y, mo, d, hh, mm, now) {
    let year = y;
    if (year == null) {
      year = now.getFullYear();
      let cand = new Date(year, mo - 1, d, hh, mm, 0);
      if (cand.getTime() < now.getTime() - 45 * 864e5) {
        cand = new Date(year + 1, mo - 1, d, hh, mm, 0);
      }
      return cand;
    }
    return new Date(year, mo - 1, d, hh, mm, 0);
  }

  function relativeDate(now, rel, wd, hh, mm) {
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0);
    if (rel === '今天') return base;
    if (rel === '明天') { base.setDate(base.getDate() + 1); return base; }
    if (rel === '后天') { base.setDate(base.getDate() + 2); return base; }
    if (rel === '大后天') { base.setDate(base.getDate() + 3); return base; }
    const map = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0 };
    const target = map[wd];
    if (target === undefined) return null;
    if (rel === '下周') {
      const daysToMon = ((8 - base.getDay()) % 7) || 7;
      base.setDate(base.getDate() + daysToMon + (target === 0 ? 6 : target - 1));
    } else {
      let delta = (target - base.getDay() + 7) % 7;
      if (delta === 0 && base.getTime() < now.getTime()) delta = 7;
      base.setDate(base.getDate() + delta);
    }
    return base;
  }

  function fixHour(hh, mm) {
    if (hh === 24) return [23, 59];
    return [hh, mm];
  }

  function parseDeadline(text, now) {
    now = now || new Date();
    const s = String(text || '');
    let m, mer, hh, mm, d;

    // 2026-11-20 23:59 / 2026年11月20日 23:59
    m = s.match(/(20\d{2})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?(?:\s*[（(]?\s*(?:周|星期)[一二三四五六日天]\s*[)）]?)?\s*(上午|下午|晚上|晚|早上|早|中午|凌晨)?\s*(\d{1,2})\s*[:：点时]\s*(\d{1,2})?/);
    if (m) {
      [hh, mm] = fixHour.apply(null, applyMeridiem(+m[5], +(m[6] || 0), m[4]));
      if (hh < 24 && mm < 60) return { date: buildDate(+m[1], +m[2], +m[3], hh, mm, now), confidence: 0.95, text: m[0] };
    }
    // 11月20日23:59 / 11月20日 晚上8点
    m = s.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日?(?:\s*[（(]?\s*(?:周|星期)[一二三四五六日天]\s*[)）]?)?\s*(上午|下午|晚上|晚|早上|早|中午|凌晨)?\s*(\d{1,2})\s*[:：点时]\s*(\d{1,2})?\s*分?/);
    if (m) {
      [hh, mm] = fixHour.apply(null, applyMeridiem(+m[4], +(m[5] || 0), m[3]));
      if (hh < 24 && mm < 60) return { date: buildDate(null, +m[1], +m[2], hh, mm, now), confidence: 0.9, text: m[0] };
    }
    // 11/20 23:59 或 11.20
    m = s.match(/(?<!\d)(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*(?:日)?\s*(上午|下午|晚上|中午|凌晨)?\s*(\d{1,2})\s*[:：]\s*(\d{1,2})?/);
    if (m) {
      [hh, mm] = fixHour.apply(null, applyMeridiem(+m[4], +(m[5] || 0), m[3]));
      if (hh < 24 && mm < 60 && +m[1] <= 12 && +m[2] <= 31) {
        return { date: buildDate(null, +m[1], +m[2], hh, mm, now), confidence: 0.82, text: m[0] };
      }
    }
    // 相对星期：本周五18:00 / 下周一 / 周三 23:59
    m = s.match(/(今天|明天|后天|大后天|本周|这周|下周|周|星期)([一二三四五六日天])?\s*(上午|下午|晚上|晚|早上|早|中午|凌晨)?\s*(\d{1,2})\s*[:：点时]\s*(\d{1,2})?/);
    if (m) {
      [hh, mm] = fixHour.apply(null, applyMeridiem(+m[4], +(m[5] || 0), m[3]));
      const base = relativeDate(now, m[1], m[2], hh, mm);
      if (base) return { date: base, confidence: 0.8, text: m[0] };
    }
    // 仅日期：11月20日 / 11月20号
    m = s.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/);
    if (m) {
      return { date: buildDate(null, +m[1], +m[2], 23, 59, now), confidence: 0.72, text: m[0] };
    }
    // 仅相对日期：明天 / 今晚 / 本周五（无具体时间，按 23:59）
    m = s.match(/(今天|明天|后天|大后天|今晚|明晚)/);
    if (m) {
      const base = relativeDate(now, m[1], null, 23, 59);
      if (base) return { date: base, confidence: 0.62, text: m[0] };
    }
    m = s.match(/(本周|这周|下周|周|星期)([一二三四五六日天])(?:前|之前)?/);
    if (m) {
      const base = relativeDate(now, m[1], m[2], 23, 59);
      if (base) return { date: base, confidence: 0.7, text: m[0] };
    }
    // 仅时间：截止 23:59
    m = s.match(/(截止|之前|前)?\s*(上午|下午|晚上|中午|凌晨)?\s*(\d{1,2})\s*[:：]\s*(\d{1,2})/);
    if (m) {
      [hh, mm] = applyMeridiem(+m[3], +m[4], m[2]);
      let base = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0);
      if (base.getTime() < now.getTime()) base.setDate(base.getDate() + 1);
      return { date: base, confidence: 0.55, text: m[0] };
    }
    return null;
  }

  /* ---------- 来源 App / 群聊上下文 ---------- */
  function detectSourceApp(text) {
    const t = String(text || '');
    let qq = 0, wx = 0, dd = 0;
    // 明确写出 QQ 群/群号才算 QQ；钉钉的“内部群/已读/小小鼓励”不能算 QQ
    if (/QQ群|qq群|QQ\s*群|群号\s*[:：]?\s*\d{5,}/i.test(t)) qq += 6;
    else if (/QQ|qq/i.test(t)) qq += 2;
    if (/钉钉|DingTalk/i.test(t)) dd += 6;
    if (/小小鼓励|团队更凝聚|群内鼓励/.test(t)) dd += 4;
    if (/内部群/.test(t)) dd += 4;
    if (/已读\s*[（(]\s*\d|未读\s*[（(]\s*\d|点赞\s*[（(]\s*\d/.test(t)) dd += 2;
    if (/群公告|群文件|群课堂|全员禁言|管理员/.test(t)) dd += 1;
    if (/微信|WeChat|订阅号|服务通知|文件传输助手|朋友圈|公众号|拍了拍/.test(t)) wx += 4;
    if (qq >= 6 && qq > dd) return { key: 'qq', name: 'QQ群', confidence: 0.95 };
    if (dd >= 4) return { key: 'dingtalk', name: '钉钉群', confidence: dd >= 6 ? 0.93 : 0.85 };
    if (qq >= 2) return { key: 'qq', name: 'QQ群', confidence: 0.75 };
    if (wx >= 4) return { key: 'wechat', name: '微信群', confidence: 0.82 };
    if (/学习通|超星/.test(t)) return { key: 'chaoxing', name: '学习通', confidence: 0.8 };
    if (/雨课堂/.test(t)) return { key: 'yuketang', name: '雨课堂', confidence: 0.8 };
    if (/腾讯会议/.test(t)) return { key: 'tencentmeeting', name: '腾讯会议', confidence: 0.75 };
    if (/邮件|邮箱|@[a-z0-9.-]+\.[a-z]{2,}/i.test(t)) return { key: 'mail', name: '邮件', confidence: 0.6 };
    return { key: 'screenshot', name: '系统截图', confidence: 0.4 };
  }
  const CHAT_NOISE = /^(详情|编辑|置顶|已读|未读|点赞|评论|还没有人|小小鼓励|更新于|昨天|今天|\d{1,2}[:：]\d{2}|←|→|×|↑|发送|取消|完成|成员|群主|管理员|回复|转发|收藏|更多|返回|关闭)/;
  const CHAT_COURSE_WORD = /大学|英语|数学|物理|化学|程序|设计|导论|原理|体育|历史|政治|经济|管理|课程|实验|编译|网络|数据结构|算法|电路|力学|思政|形势|心理健康/;
  function chatContext(text) {
    const lines = String(text || '').split(/\n/).map(x => x.trim()).filter(Boolean);
    let course = '', group = '', conf = 0, ci = -1;
    for (let i = 0; i < Math.min(lines.length, 14); i++) {
      const l = lines[i];
      if (!l || CHAT_NOISE.test(l)) continue;
      if (/(?:[（(]\s*[（(]?\s*20\d{2}\s*[-–—]\s*20\d{2}|内部群|位成员|课程群)/.test(l)) {
        let pre = l.split(/[（(]/)[0].replace(/\s+/g, ' ').trim();
        pre = pre.replace(/\s*(?:内部群|群).*$/, '').trim();
        if (pre.length >= 2 && pre.length <= 20 && /^[\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9 ]{1,19}$/.test(pre) && !/通知|公告|作业|任务/.test(pre)) {
          course = pre; group = pre; conf = 0.92; ci = i; break;
        }
      }
    }
    if (!course) {
      for (let i = 0; i < Math.min(lines.length, 12); i++) {
        const l = lines[i];
        if (!l || CHAT_NOISE.test(l)) continue;
        if (/[（(]/.test(l) && CHAT_COURSE_WORD.test(l) && l.length <= 40) {
          const pre = l.split(/[（(]/)[0].replace(/\s+/g, ' ').trim();
          if (pre.length >= 2 && pre.length <= 20) { course = pre; group = pre; conf = 0.7; ci = i; break; }
        }
        // 群标题不一定带年份/括号：取含课程关键词的短标题行
        if (!/[（(]/.test(l) && CHAT_COURSE_WORD.test(l) && l.length <= 20 &&
            !/通知|公告|作业|任务|老师|教师|成员|群|大学$|学院$|中学$/.test(l)) {
          course = l; group = l; conf = 0.72; ci = i; break;
        }
      }
    }
    let teacher = '';
    if (ci >= 0) {
      for (let d = 1; d <= 6; d++) {
        const l = lines[ci + d] || '';
        if (!l || CHAT_NOISE.test(l) || /[：:（）()]/.test(l)) continue;
        if (/^[\u4e00-\u9fa5]{2,4}$/.test(l) && !CHAT_COURSE_WORD.test(l)) { teacher = l; break; }
      }
    }
    return { course: course, teacher: teacher, group: group, confidence: conf, index: ci };
  }

  function chatAssignment(text, now) {
    const lines = String(text || '').split(/\n/).map(x => x.trim()).filter(Boolean);
    let start = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^(assignment|homework|作业|任务|本周作业|第\s*\d+\s*周作业)/i.test(lines[i])) { start = i; break; }
    }
    if (start < 0) return null;
    const body = [];
    for (let i = start; i < lines.length && body.length < 10; i++) {
      const l = lines[i];
      if (i > start && (CHAT_NOISE.test(l) || /^(子程|芳俊|嘉鑫|淝溢|李红冉|周子程|严芳俊|彭嘉鑫)$/.test(l))) break;
      body.push(l);
    }
    const joined = body.join(' ');
    let name = '作业';
    const wm = joined.match(/assignment\s+for\s+week\s*(\d+)/i);
    if (wm) name = '第' + wm[1] + '周作业';
    if (/听力/.test(joined)) name += ' · 听力';
    else if (/报告/.test(joined)) name += ' · 报告';
    else if (/阅读|reading/i.test(joined)) name += ' · 阅读';
    else if (/作文|writing/i.test(joined)) name += ' · 写作';
    let dl = null;
    if (/截止|deadline|due|前完成|前提交/i.test(joined)) dl = parseDeadline(joined, now || new Date());
    return {
      id: uid('tk'), name: name.slice(0, 28), deadline: dl ? iso(dl.date) : '',
      platform: '', type: '作业', status: '未完成', confidence: 0.7,
      deadlineConfidence: dl ? dl.confidence : 0.3, detail: joined.slice(0, 300)
    };
  }

  /* ---------- 课程名 ---------- */
  function extractCourse(text, now) {
    const cands = [];
    let m;
    if ((m = text.match(/《([^》\n]{2,30})》/))) cands.push({ v: m[1], s: 0.96, p: '书名号' });
    if ((m = text.match(/【([^】\n]{2,30})】/))) cands.push({ v: m[1], s: 0.9, p: '方括号' });
    if ((m = text.match(/(?:课程名称|课程名|科目)\s*[:：]\s*([^\n，。；]{2,30})/))) cands.push({ v: m[1], s: 0.95, p: '课程字段' });
    if ((m = text.match(/(?:关于|就)?\s*([\u4e00-\u9fa5A-Za-z0-9（）()·\-]{2,24})\s*(?:课程)?\s*(?:的)?\s*(?:通知|作业|任务|安排|学习|考试)/))) cands.push({ v: m[1], s: 0.78, p: '通知标题' });
    if ((m = text.match(/^([\u4e00-\u9fa5A-Za-z0-9（）()·\-]{2,22})\s*(?:课程)?\s*[:：]/m))) cands.push({ v: m[1], s: 0.7, p: '行首字段' });
    if ((m = text.match(/([\u4e00-\u9fa5]{2,18})\s*(?:课程)?\s*(?:第\s*\d+\s*次)?\s*作业/))) cands.push({ v: m[1], s: 0.66, p: '作业标题' });
    if ((m = text.match(/(?:提交|完成|做|写|参加)?\s*([\u4e00-\u9fa5]{2,14})(?:实验|实训|上机)\s*(?:报告|作业|任务)?/))) cands.push({ v: m[1], s: 0.68, p: '实验标题' });
    if ((m = text.match(/([\u4e00-\u9fa5A-Za-z]{2,14}(?:数学|英语|物理|化学|生物|历史|地理|政治|语文|体育|程序|设计|原理|概论|导论|代数|电路|力学|材料|经济|管理|会计|统计|法律|哲学|文学|实验|史|论|学))\s*(?:课程|课)?\s*(?=[，,：:\s]|老师|教师|[\u4e00-\u9fa5]{1,3}(?:老师|教师|教授)|$)/))) cands.push({ v: m[1], s: 0.86, p: '学科名' });
    if ((m = text.match(/([\u4e00-\u9fa5]{2,14})(?:期末|期中|结课)(?:考试|论文|报告|作业)/))) cands.push({ v: m[1], s: 0.72, p: '考核标题' });
    if ((m = text.match(/([\u4e00-\u9fa5]{2,8}[A-Za-z]?\d{1,2})\s*(?:期中|期末)/))) cands.push({ v: m[1], s: 0.82, p: '简称+考核', allowDigits: true });
    const firstLine = text.split('\n').map(x => x.trim()).filter(Boolean)[0] || '';
    const flClean = firstLine.replace(/\s+([\u4e00-\u9fa5]{2,4}\s*(老师|教授)|[\u4e00-\u9fa5]{2,3})$/, '').trim();
    if (flClean.length >= 2 && flClean.length <= 24
        && !/通知|公告|各位|同学|截止|提交|作业|时间/.test(firstLine)) {
      cands.push({ v: flClean, s: 0.55, p: '首行' });
    }
    const bad = /^(通知|公告|各位|同学|老师|大家好|请|关于|课程|作业|截止|时间|地点)$/;
    const clean = cands
      .map(c => Object.assign({}, c, { v: c.v.replace(/[《》【】\s]/g, '').replace(/^(关于|就|前|提交|完成|请|于|在|把|将|各位同学|同学们)+/, '')
        .replace(/(截止时间|截止日期|提交方式|截止|时间|方式|地点|通知|安排)$/g, '')
        .replace(/(实验|作业|习题|任务|测验)[一二三四五六七八九十\d]+$/g, '')
        .replace(/(\d{1,2}\s*[:：点时]\s*\d{0,2}\s*分?|点前|时前|分前)/g, ' ')
        .replace(/(提交|上交|完成|请|于|在|把|将|各位同学|同学们)/g, ' ')
        .replace(/(课程)?(通知|作业|任务|安排)$/, '').replace(/课程$/, '').trim() }))
      .filter(c => c.v.length >= 2 && c.v.length <= 24 && !bad.test(c.v)
        && !/截止|提交|上传|时间|地点|方式|群号|二维码/.test(c.v)
        && !/^(本周|这周|下周|周|星期|今天|明天|后天)/.test(c.v)
        && !/[:：]/.test(c.v) && (c.allowDigits || !/\d/.test(c.v)));
    if (!clean.length) return { course: '未识别课程', confidence: 0.35 };
    clean.sort((a, b) => b.s - a.s);
    return { course: clean[0].v, confidence: clean[0].s, pattern: clean[0].p };
  }

  function extractTeacher(text) {
    const bad = /^(请|于|在|把|将|从|向|和|与|大家|同学|各位|任课|授课|主讲|指导|联系)/;
    let m = text.match(/([\u4e00-\u9fa5]{1,3})\s*(老师|教授)/);
    if (m && !bad.test(m[1])) return { teacher: m[1] + m[2], confidence: 0.86 };
    m = text.match(/(?:任课教师|授课教师|主讲教师|指导教师|教师)\s*[:：]?\s*([\u4e00-\u9fa5]{2,4})\s*(老师|教授)?/);
    if (m && !bad.test(m[1])) return { teacher: m[1] + (m[2] || ''), confidence: 0.9 };
    return { teacher: '', confidence: 0.4 };
  }

  /* ---------- 平台 ---------- */
  function extractPlatforms(text) {
    const found = [];
    PLATFORMS.forEach(p => {
      let idx = -1, hit = null;
      for (const a of p.aliases) {
        const i = text.indexOf(a);
        if (i >= 0 && (idx < 0 || i < idx)) { idx = i; hit = a; }
      }
      if (idx < 0) return;
      // 只取平台所在句子，避免相邻句子的用途串味
      let start = idx, end = idx + hit.length;
      while (start > 0 && !/[。；;\n！!？?]/.test(text[start - 1])) start--;
      while (end < text.length && !/[。；;\n！!？?]/.test(text[end])) end++;
      const win = text.slice(start, end);
      const localIdx = idx - start;
      let best = null, bestDist = 999;
      for (const pu of PURPOSES) {
        const re = new RegExp(pu.re.source, 'gi');
        let mm;
        while ((mm = re.exec(win))) {
          const center = mm.index + mm[0].length / 2;
          const dist = Math.abs(center - (localIdx + hit.length / 2));
          if (dist < bestDist) { bestDist = dist; best = pu.key; }
        }
      }
      let purpose = bestDist <= 26 ? best : '';
      if (!purpose) purpose = p.type === 'group' ? '群内通知' : '查看通知';
      found.push({
        id: uid('pf'),
        name: p.name,
        purpose,
        entry_type: p.type,
        entry_value: p.url,
        fallback: p.type === 'group' ? '复制群号' : (p.type === 'article' ? '复制链接' : '复制链接'),
        status: p.url ? '可用' : '需复制'
      });
    });
    // 群/公众号由 group_info 单独承载，避免卡片里重复出现
    return found.filter(p => p.entry_type !== 'group' && p.entry_type !== 'article');
  }

  function extractGroup(text) {
    // 钉钉群邀请链接 / 群二维码链接：保存后可直接唤起钉钉
    const dm = text.match(/https?:\/\/(?:qr\.)?dingtalk\.com\/[^\s，。；;）)]*/i) || text.match(/dingtalk:\/\/[^\s，。；;）)]*/i);
    if (dm) return { type: '钉钉群', value: '钉钉群', link: dm[0], fallback: '打开钉钉', confidence: 0.9 };
    let m = text.match(/(?:QQ群|qq群|群号|群)\s*(?:号)?\s*[:：]?\s*(\d{6,12})/);
    if (m) return { type: 'QQ群', value: m[1], fallback: '复制群号', confidence: 0.9 };
    m = text.match(/(?:QQ群|qq群)\s*(?:号)?\s*[:：]?\s*([^\s，。；]{5,30})/);
    if (m && !/^\d+$/.test(m[1])) return { type: 'QQ群', value: m[1], fallback: '复制群号', confidence: 0.65 };
    if (/微信群|扫码.*群|加群/.test(text)) return { type: '微信群', value: '群二维码 / 联系任课教师', fallback: '联系老师', confidence: 0.6 };
    m = text.match(/公众号\s*[「“"]?([^」”"，。；\s]{2,20})/);
    if (m) return { type: '公众号', value: m[1], fallback: '复制名称', confidence: 0.7 };
    return null;
  }

  /* ---------- 任务 ---------- */
  function cleanTaskName(raw, ctx) {
    let s = String(raw);
    ctx = ctx || {};
    // 去掉群公告前缀、编号、平台名、课程名、教师名与括号标题
    s = s.replace(/^@\s*所有人\s*/g, ' ')
      .replace(/^\s*本周任务\s*[:：]?\s*/g, ' ')
      .replace(/^\s*[（(]\s*\d{1,2}\s*[）)]\s*/g, ' ')
      .replace(/^\s*(任务|作业)\s*[:：]\s*/g, ' ');
    ParserPlatformAliases.forEach(a => {
      if (/^(PTA|pta|拼题A|pintia)$/.test(a)) return; // PTA 习题集是专有名称，保留在任务名里
      s = s.split(a).join(' ');
    });
    if (ctx.course && ctx.course.length >= 3 && !/^(观题|客观题?|作业|任务|课程|通知|考试)$/.test(ctx.course)) s = s.split(ctx.course).join(' ');
    if (ctx.teacher) s = s.split(ctx.teacher).join(' ');
    s = s.replace(/关于|对于/g, ' ')
      .replace(/[【《][^】》]{0,30}[】》]/g, ' ')
      .replace(/(时间|日期)(是|为|[:：])?/g, ' ')
      .replace(/^[\u4e00-\u9fa5]{2,10}[A-Za-z]?\d{0,2}\s*(?=(?:期中|期末|考试|测验|作业|实验|报告|论文|习题|练习|项目|展示))/g, ' ')
      .replace(/^(关于|就)?\s*(课程通知|通知|公告)[:：]?\s*/, ' ')
      .replace(/(课程的通知|课程通知|通知|公告)/g, ' ')
      .replace(/(逾期不候|逾期|谢谢|请知悉|特此通知|望周知)/g, ' ')
      .replace(/截止(时间|日期)?\s*[:：]?/g, ' ')
      .replace(/(定于|安排在|开始|举行|进行|请务必|务必|请|大家|同学们|各位同学|注意|提醒|记得|需要|要求|于|在|把|将)/g, ' ')
      .replace(/(提交|上交|交|上传|完成|参加|观看|打卡|签到|报名|预习|复习|练习|准备|已开放|已发布|已上线|可以|先|结合|一下)/g, ' ')
      .replace(/(今天|明天|后天|大后天|今晚|明晚)/g, ' ')
      .replace(/(本周|这周|下周)([一二三四五六日天])/g, ' ')
      .replace(/[（(][^）)]{0,20}(周|星期|月|日|点|[:：])[^）)]{0,20}[)）]/g, ' ')
      .replace(/(上午|下午|晚上|晚|早上|早|中午|凌晨)?\s*\d{1,2}\s*[:：点时]\s*\d{0,2}\s*分?/g, ' ')
      .replace(/(前|之前|以前|截止)/g, ' ')
      .replace(/[（(]\s*[)）]/g, ' ')
      .replace(/[，,。；;：:\-—•·|]/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    return s.replace(/^[\s、到在于]+|[\s、到在于和及]+$/g, '').replace(/\s{2,}/g, ' ').slice(0, 28);
  }

  const ParserPlatformAliases = [];
  PLATFORMS.forEach(p => ParserPlatformAliases.push(...p.aliases));

  function splitTaskItems(text) {
    let s = String(text || '').replace(/\r/g, '');
    // (1)/（1）编号：即使和上一句挤在一行，也先断成独立条目
    s = s.replace(/\s*(?=[（(]\s*\d{1,2}\s*[）)])/g, '\n');
    // 行首 1. / 1、 编号
    s = s.replace(/(^|\n)\s*(\d{1,2})[.、]\s*/g, '$1\n$2. ');
    // OCR 常把一条任务折成多行：把编号条目后续的折行接回去（不接聊天区/下一条编号）
    const lines = s.split('\n');
    const out = [];
    let inItem = false;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (/^[（(]\s*\d{1,2}\s*[）)]/.test(line)) {
        out.push(line); inItem = true; continue;
      }
      if (inItem) {
        const prev = out[out.length - 1];
        if (/[。！？!?]\s*[）)]?$/.test(prev)) { out.push(line); inItem = false; }
        else out[out.length - 1] = prev + line;
      } else {
        out.push(line);
      }
    }
    return out.join('\n');
  }

  function platformForClause(text) {
    const t = String(text || '').toLowerCase();
    let best = null, pos = 1e9;
    for (const p of PLATFORMS) {
      for (const a of p.aliases) {
        const i = t.indexOf(String(a).toLowerCase());
        if (i >= 0 && i < pos) { pos = i; best = p.name; }
      }
    }
    return best || '';
  }

  function extractTasks(text, now, ctx) {
    ctx = ctx || {};
    const clauses = splitTaskItems(text).split(/[。；;\n！!？?，,]/).map(x => x.trim()).filter(x => x.length >= 2);
    const tasks = [];
    let prevDl = null;
    for (const c of clauses) {
      const dl = parseDeadline(c, now);
      if (!dl && /考试内容|考试范围|复习范围|题型|分值|还是以|以.{0,20}为主/.test(c)) { prevDl = null; continue; }
      const noun = c.match(TASK_NOUN);
      const hasVerb = TASK_WORDS.test(c);
      const prevHadDeadlineOnly = prevDl && /截止|deadline|前完成|前提交/i.test(c === clauses[0] ? '' : '');
      if (!dl && !noun) { prevDl = null; continue; }
      if (!hasVerb && !/截止|deadline/i.test(c)) { prevDl = dl || prevDl; continue; }
      const localDl = dl || (prevDl && /^\s*(截止|deadline)/i.test(prevLineText(clauses, c)) ? prevDl : null);
      let nameRaw = c.split(/特别是|尤其是|比如|例如/)[0];
      if (dl) nameRaw = nameRaw.replace(dl.text, ' ');
      nameRaw = nameRaw.replace(/(截止(时间|日期)?|deadline)\s*[:：]?\s*$/i, ' ');
      let name = cleanTaskName(nameRaw, ctx);
      if (!name) name = noun ? cleanTaskName(noun[1], ctx) : '';
      if (!name || name.length < 2) { prevDl = dl || prevDl; continue; }
      if (/^(视频|资料|课件|练习|作业|任务|通知|公告|习题|报告)$/.test(name)) { prevDl = dl || prevDl; continue; }
      if (/^(提交|完成|截止|作业|任务|通知|前|到|在)$/.test(name)) name = '待确认任务';
      const type = /考试|测验|测试/.test(c) ? '考试' : (/签到|打卡/.test(c) ? '签到' : (/讨论/.test(c) ? '讨论' : (/预习/.test(c) ? '预习' : (/观看|视频/.test(c) ? '观看' : '作业'))));
      let conf = 0.42;
      if (localDl) conf = localDl.confidence;
      if (noun) conf += 0.08;
      if (hasVerb) conf += 0.05;
      tasks.push({
        id: uid('tk'),
        name: name.slice(0, 28),
        deadline: localDl ? iso(localDl.date) : '',
        platform: platformForClause(c),
        type,
        status: '未完成',
        confidence: clamp01(conf),
        deadlineConfidence: localDl ? localDl.confidence : 0.3
      });
      prevDl = dl || prevDl;
    }
    // 去重
    const seen = new Set();
    return tasks.filter(t => {
      const k = t.name.replace(/\s/g, '') + '|' + t.deadline.slice(0, 10);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 8);
  }

  function prevLineText(clauses, c) {
    const i = clauses.indexOf(c);
    return i > 0 ? clauses[i - 1] : '';
  }

  function extract(text, source, now) {
    now = now || new Date();
    const raw = String(text || '');
    const t = norm(raw);
    const app = detectSourceApp(t);
    let c = extractCourse(t, now);
    let te = extractTeacher(t);
    const platforms = extractPlatforms(t);
    let group = extractGroup(t);
    let chatTask = null;
    if (app.key === 'qq' || app.key === 'wechat' || app.key === 'dingtalk') {
      const cc = chatContext(t);
      if (cc.course) c = { course: cc.course, confidence: cc.confidence, pattern: '群聊标题' };
      if (cc.teacher && (!te.teacher || te.confidence < 0.7)) te = { teacher: cc.teacher, confidence: 0.68 };
      const appGroup = app.key === 'dingtalk' ? '钉钉群' : (app.key === 'wechat' ? '微信群' : 'QQ群');
      if (!group) group = { type: appGroup, value: cc.group || cc.course || app.name, fallback: '复制群名', confidence: 0.8 };
      else {
        if (!group.value || /^(钉钉群|QQ群|微信群)$/.test(group.value)) group.value = cc.group || cc.course || group.value;
        group.type = appGroup;
        group.fallback = group.link ? '复制链接' : (app.key === 'dingtalk' ? '打开钉钉' : '复制群名');
      }
      chatTask = chatAssignment(t, now);
    }
    // 任务必须在群标题覆盖课程/教师之后再抽，避免用错的课程名把任务名切坏
    let tasks = extractTasks(t, now, { course: c.course, teacher: te.teacher });
    if (chatTask && !tasks.some(x => x.name.replace(/\s/g, '') === chatTask.name.replace(/\s/g, ''))) tasks.unshift(chatTask);
    const conf = {
      course: clamp01(c.confidence),
      teacher: clamp01(te.confidence),
      platforms: clamp01(platforms.length ? 0.86 : 0.35),
      tasks: clamp01(tasks.length ? Math.max.apply(null, tasks.map(x => x.confidence)) : 0.35),
      deadline: clamp01(tasks.some(x => x.deadline) ? Math.max.apply(null, tasks.map(x => x.deadlineConfidence || 0)) : 0.3)
    };
    // 给任务补平台：优先取与任务同句的平台
    const primary = platforms.find(p => p.purpose === '提交作业') || platforms[0];
    tasks.forEach(x => { if (!x.platform && primary) x.platform = primary.name; });
    return {
      course: c.course,
      teacher: te.teacher,
      platforms,
      tasks,
      group_info: group,
      confidence: conf,
      source_app: app,
      source: source || '用户粘贴',
      raw_text: raw,
      created_at: iso(now),
      updated_at: iso(now)
    };
  }

  /* ---------- 课表文本 ---------- */
  // 常见作息；若课表里写了具体时间，以具体时间为准
  const PERIOD_TIMES = {
    1: ['08:00', '08:45'], 2: ['08:55', '09:40'], 3: ['10:00', '10:45'], 4: ['10:55', '11:40'],
    5: ['14:00', '14:45'], 6: ['14:55', '15:40'], 7: ['16:00', '16:45'], 8: ['16:55', '17:40'],
    9: ['19:00', '19:45'], 10: ['19:55', '20:40'], 11: ['20:50', '21:35'], 12: ['21:45', '22:30']
  };
  const WD_NAMES = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

  function parseTimetable(text, source, now) {
    now = now || new Date();
    const lines = String(text || '').split(/\n/).map(x => x.trim()).filter(Boolean);
    const out = [];
    const map = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7 };
    lines.forEach(line => {
      const wd = line.match(/(?:周|星期)([一二三四五六日天])/);
      if (!wd) return;
      const weekday = map[wd[1]];
      const timeM = line.match(/(\d{1,2})[:：](\d{2})\s*[-~—至]\s*(\d{1,2})[:：](\d{2})/);
      const perM = line.match(/(?:第)?\s*(\d{1,2})\s*(?:[-~—至、,，]\s*(\d{1,2}))?\s*节/);
      let start = '', end = '', periodText = '';
      if (timeM) {
        start = ('0' + timeM[1]).slice(-2) + ':' + timeM[2];
        end = ('0' + timeM[3]).slice(-2) + ':' + timeM[4];
        periodText = start + '-' + end;
      } else if (perM) {
        const p1 = +perM[1], p2 = +perM[2] || p1;
        if (PERIOD_TIMES[p1] && PERIOD_TIMES[p2]) {
          start = PERIOD_TIMES[p1][0];
          end = PERIOD_TIMES[p2][1];
          periodText = '第' + p1 + (p2 !== p1 ? '-' + p2 : '') + '节';
        }
      }
      // 显式地点
      let location = '';
      const locM = line.match(/(?:地点|教室|上课地点)\s*[:：]\s*([^\s,，;；|]+)/);
      if (locM) location = locM[1];
      let tokens = line.replace(/[|｜,，;；\t]+/g, ' ').split(/\s+/).filter(Boolean);
      tokens = tokens.filter(t => {
        if (/^(周|星期)[一二三四五六日天]$/.test(t)) return false;
        if (/^(第)?\d{1,2}([-~—至、,，]\d{1,2})?节$/.test(t)) return false;
        if (/^\d{1,2}[:：]\d{2}([-~—至]\d{1,2}[:：]\d{2})?$/.test(t)) return false;
        if (/^(上午|下午|晚上|早上)$/.test(t)) return false;
        if (/^(第)?\d{1,2}([-~—]\d{1,2})?周$/.test(t) || /^(单|双)周$/.test(t)) return false;
        if (!location && isLocationToken(t)) { location = t; return false; }
        return true;
      });
      if (!tokens.length) return;
      let teacher = '';
      const ti = tokens.findIndex(t => /^[\u4e00-\u9fa5]{1,3}(老师|教授)$/.test(t));
      if (ti >= 0) {
        teacher = tokens[ti];
        tokens.splice(ti, 1);
      } else if (tokens.length >= 2 && /^[\u4e00-\u9fa5]{2,3}$/.test(tokens[tokens.length - 1])) {
        teacher = tokens.pop();
      }
      const name = tokens.join(' ').replace(/^[·\-—\s]+|[·\-—\s]+$/g, '').trim();
      if (!name || name.length > 24) return;
      const sched = WD_NAMES[weekday] + (start ? ' ' + start + '-' + end : '') + (location ? ' · ' + location : '');
      out.push({
        course: name,
        teacher,
        weekday,
        start,
        end,
        slot: periodText || (start ? start + '-' + end : ''),
        location,
        schedule: sched
      });
    });
    // 合并同名课程，保留多节课
    const merged = [];
    out.forEach(o => {
      let f = merged.find(x => x.course === o.course);
      if (!f) {
        f = { course: o.course, teacher: o.teacher, sessions: [], schedule: '' };
        merged.push(f);
      }
      if (!f.teacher && o.teacher) f.teacher = o.teacher;
      if (!f.sessions.some(s => s.weekday === o.weekday && s.start === o.start && s.end === o.end && s.location === o.location)) {
        f.sessions.push({ weekday: o.weekday, start: o.start, end: o.end, location: o.location, periods: o.slot });
      }
      if (o.schedule && f.schedule.indexOf(o.schedule) < 0) f.schedule += (f.schedule ? ' / ' : '') + o.schedule;
    });
    return merged.slice(0, 20).map(o => ({
      id: uid('crs'),
      course: o.course,
      teacher: o.teacher,
      platforms: [],
      tasks: [],
      group_info: null,
      schedule: o.schedule,
      sessions: o.sessions,
      confidence: { course: 0.8, teacher: o.teacher ? 0.8 : 0.4, platforms: 0.3, tasks: 0.3 },
      source: source || '课表导入',
      raw_text: text,
      created_at: iso(now),
      updated_at: iso(now)
    }));
  }

  function isLocationToken(t) {
    return /(教学楼|实验楼|综合楼|教|实验|综合|图书)[一二三四五六七八九十\d]*\d{2,4}(室|教室)?$/.test(t) ||
      /(楼|馆|室|场|区)\s*[A-Za-z]?\d{1,4}/.test(t) ||
      /^[A-Za-z]?\d{3,4}(室|教室)?$/.test(t);
  }


  /* ---------- 课表图片（表格版） ---------- */
  // OCR 服务返回每个词的坐标；这里用坐标 + 图片像素还原“周几 × 第几节”的彩色块。
  function parseTimetableImage(text, overlay, dataUrl, source, now) {
    return new Promise(function (resolve) {
      try {
        if (!overlay || !overlay.lines || !overlay.lines.length || !dataUrl) return resolve(null);
        var img = new Image();
        img.onload = function () {
          try {
            var list = gridFromImage(img, overlay.lines, text, source, now);
            if ((!list || !list.length) && /\(\s*\d{1,2}\s*[-~—至]\s*\d{1,2}\s*节\s*\)/.test(String(text || ''))) {
              var items = overlay.lines.map(function (l) {
                return { text: String(l.text || '').trim(), x: +l.left, y: +l.top, w: +l.width, h: +l.height };
              });
              list = parsePdfTimetable([{ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height, items: items }], source, now);
            }
            resolve(list);
          } catch (e) { resolve(null); }
        };
        img.onerror = function () { resolve(null); };
        img.src = dataUrl;
      } catch (e) { resolve(null); }
    });
  }

  function gridFromImage(img, rawLines, text, source, now) {
    now = now || new Date();
    var W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    if (!W || !H) return null;
    var WD = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7 };
    var lines = [];
    rawLines.forEach(function (l) {
      var t = String(l.text || l.LineText || '').replace(/\s+/g, ' ').trim();
      if (!t) return;
      var left = +l.left, top = +l.top, w = +l.width, h = +l.height;
      if (!isFinite(left) || !isFinite(top) || !isFinite(w) || !isFinite(h)) return;
      lines.push({ text: t, left: left, top: top, width: w, height: h, cx: left + w / 2, cy: top + h / 2 });
    });
    if (lines.length < 8) return null;

    // 1) 找列头：日期数字优先，周几字用来判断偏移
    var dates = lines.filter(function (l) {
      return /^\d{1,2}$/.test(l.text) && +l.text >= 1 && +l.text <= 31 &&
        l.cy > H * 0.03 && l.cy < H * 0.14 && l.cx > W * 0.10;
    }).sort(function (a, b) { return a.cx - b.cx; });
    var heads = lines.filter(function (l) {
      var c = l.text.replace(/^周/, '');
      return WD[c] && l.cy < H * 0.10;
    }).sort(function (a, b) { return a.cx - b.cx; });
    var cols = [];
    if (dates.length >= 3) {
      cols = dates.map(function (d) { return d.cx; });
    } else if (heads.length >= 2) {
      var hStep = (heads[heads.length - 1].cx - heads[0].cx) / (heads.length - 1);
      if (!(hStep > W * 0.05)) return null;
      var base = heads[0];
      for (var wd = 1; wd <= 7; wd++) {
        var x = base.cx + (wd - WD[base.text.replace(/^周/, '')]) * hStep;
        if (x > W * 0.10 && x < W * 0.97) cols.push(x);
      }
    } else {
      return null;
    }
    if (cols.length < 3) return null;
    var step = cols.length > 1 ? (cols[cols.length - 1] - cols[0]) / (cols.length - 1) : W * 0.16;
    var known = {};
    heads.forEach(function (h) {
      var k = WD[h.text.replace(/^周/, '')];
      var idx = -1, best = step * 0.65;
      for (var i = 0; i < cols.length; i++) {
        if (Math.abs(cols[i] - h.cx) < best) { best = Math.abs(cols[i] - h.cx); idx = i; }
      }
      if (idx >= 0) known[idx] = k;
    });
    var weekdays = [];
    for (var i2 = 0; i2 < cols.length; i2++) {
      if (known[i2]) { weekdays[i2] = known[i2]; continue; }
      var near = -1;
      for (var k2 in known) { if (near < 0 || Math.abs(+k2 - i2) < Math.abs(near - i2)) near = +k2; }
      weekdays[i2] = near >= 0 ? normWeekday(known[near] + (i2 - near)) : (i2 + 1);
    }
    var bounds = [];
    for (var b = 0; b < cols.length; b++) {
      var lft = b ? (cols[b - 1] + cols[b]) / 2 : Math.max(W * 0.08, cols[b] - step / 2);
      var rgt = b < cols.length - 1 ? (cols[b] + cols[b + 1]) / 2 : Math.min(W * 0.99, cols[b] + step / 2);
      bounds.push([lft, rgt]);
    }

    // 2) 左侧时间轴：每个节次的开始/结束时间
    var times = [];
    lines.forEach(function (l) {
      var m = l.text.match(/^(\d{1,2})[:：](\d{2})$/);
      if (m && l.cx < W * 0.16) {
        var mins = +m[1] * 60 + +m[2];
        if (!times.some(function (t) { return Math.abs(t.y - l.cy) < 3; })) times.push({ y: l.cy, mins: mins, text: pad2(+m[1]) + ':' + m[2] });
      }
    });
    times.sort(function (a, b) { return a.y - b.y; });
    if (times.length < 4) return null;
    var periodNums = lines.filter(function (l) {
      return /^\d{1,2}$/.test(l.text) && +l.text >= 1 && +l.text <= 20 &&
        l.cx < W * 0.11 && l.cy > H * 0.10 && l.cy < H * 0.97;
    }).map(function (l) { return { y: l.cy, n: +l.text }; }).sort(function (a, b) { return a.y - b.y; });

    // 3) 在画布上按列找彩色块
    var runsByCol = imageColorRuns(img, bounds, W, H);
    if (!runsByCol) return null;

    var out = [];
    runsByCol.forEach(function (runs, ci) {
      runs.forEach(function (run) {
        var y0 = run[0], y1 = run[1];
        var inside = lines.filter(function (l) {
          return l.cx >= bounds[ci][0] && l.cx <= bounds[ci][1] &&
            l.cy >= y0 - 4 && l.cy <= y1 + 4 &&
            l.cy > H * 0.10 &&
            !/^\d{1,2}[:：]\d{2}$/.test(l.text) &&
            !/^\d{1,2}$/.test(l.text) &&
            !/^(周[一二三四五六日天]|[一二三四五六日天])$/.test(l.text) &&
            !/第\s*\d+\s*周/.test(l.text);
        }).sort(function (a, b) { return a.cy - b.cy; });
        if (!inside.length) return;
        var info = parseGridBlock(inside);
        if (!info.course) return;
        var st = timeAt(times, y0, H * 0.025, false);
        var en = timeAt(times, y1, H * 0.005, true);
        if (!st || !en) return;
        if (en.mins <= st.mins) {
          var nxt = times.filter(function (t) { return t.mins > st.mins; })[0];
          if (nxt) en = nxt;
        }
        if (!(en.mins > st.mins)) return;
        var nums = periodNums.filter(function (p) { return p.y >= y0 - 8 && p.y <= y1 + 8; });
        var slot = nums.length >= 2 ? '第' + nums[0].n + '-' + nums[nums.length - 1].n + '节' :
          (nums.length === 1 ? '第' + nums[0].n + '节' : st.text + '-' + en.text);
        out.push({
          course: info.course, teacher: info.teacher, weekday: normWeekday(weekdays[ci]),
          start: st.text, end: en.text, slot: slot, location: info.location,
          schedule: WD_NAMES[normWeekday(weekdays[ci])] + ' ' + st.text + '-' + en.text + (info.location ? ' · ' + info.location : '')
        });
      });
    });
    if (!out.length) return null;

    // 4) 同名课程合并成一张卡
    var merged = [];
    out.forEach(function (o) {
      var key = o.course.replace(/\s+/g, '');
      var f = merged.filter(function (x) { return x.course === key; })[0];
      if (!f) {
        f = { course: key, teacher: o.teacher, sessions: [], schedule: '' };
        merged.push(f);
      }
      if (!f.teacher && o.teacher) f.teacher = o.teacher;
      if (!f.sessions.some(function (s) { return s.weekday === o.weekday && s.start === o.start && s.end === o.end && s.location === o.location; })) {
        f.sessions.push({ weekday: o.weekday, start: o.start, end: o.end, location: o.location, periods: o.slot });
      }
      if (o.schedule && f.schedule.indexOf(o.schedule) < 0) f.schedule += (f.schedule ? ' / ' : '') + o.schedule;
    });
    return merged.slice(0, 20).map(function (o) {
      return {
        id: uid('crs'), course: o.course, teacher: o.teacher, platforms: [], tasks: [], group_info: null,
        schedule: o.schedule, sessions: o.sessions,
        confidence: { course: 0.74, teacher: o.teacher ? 0.72 : 0.35, platforms: 0.3, tasks: 0.3 },
        source: source || '课表图片', raw_text: text, created_at: iso(now), updated_at: iso(now)
      };
    });
  }

  function normWeekday(n) { while (n > 7) n -= 7; while (n < 1) n += 7; return n; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function timeAt(times, y, tol, isEnd) {
    var best = null;
    for (var i = 0; i < times.length; i++) {
      if (times[i].y <= y + tol) best = times[i];
    }
    if (!best) best = times[0];
    if (isEnd && best && best.mins <= 0) best = null;
    return best;
  }

  function parseGridBlock(inside) {
    var raw = [];
    inside.forEach(function (l) {
      var t = l.text.replace(/\s+/g, ' ').trim();
      if (!t) return;
      if (/^\d{1,2}$/.test(t) || /^\d{1,2}[:：]\d{2}$/.test(t)) return;
      if (/^(周[一二三四五六日天]|[一二三四五六日天])$/.test(t)) return;
      if (/第\s*\d+\s*周/.test(t)) return;
      raw.push(t);
    });
    var tx = [];
    raw.forEach(function (t) {
      var prev = tx[tx.length - 1];
      if (prev && (t.length <= 1 || /^[心楼室馆场层]\d{0,4}$/.test(t))) tx[tx.length - 1] = prev + t;
      else tx.push(t);
    });
    // 一行里混排“课程 教师 地点”时，按最后一个地点词切开
    if (tx.length === 1 && /\s/.test(tx[0])) {
      var parts = tx[0].split(/\s+/).filter(Boolean);
      if (parts.length >= 2) tx = parts;
    }
    var location = '';
    if (tx.length >= 2) {
      var last = tx[tx.length - 1];
      if (isLocationToken(last) || /(楼|室|场|馆|中心|教室|线上|课外|田径)/.test(last)) {
        location = last; tx.pop();
      }
    }
    var teacher = '';
    if (tx.length >= 2) {
      var cand = tx[tx.length - 1];
      if (/^[\u4e00-\u9fa5]{2,4}(老师|教授)?$/.test(cand)) { teacher = cand; tx.pop(); }
    }
    var course = tx.join('').replace(/\s+/g, '').replace(/^[·\-—\s]+|[·\-—\s]+$/g, '').replace(/[，,。;；]$/, '').trim();
    if (!course || course.length > 24) course = (raw[0] || '').slice(0, 24);
    return { course: course, teacher: teacher, location: location };
  }

  /* ---------- PDF 课表（文本坐标） ---------- */
  // PDF 没有彩色块，靠列头 x、周次行的相对位置还原；节次时间按这本课表的作息换算。
  const PDF_PERIOD_TIMES = {
    1: ['08:40', '09:25'], 2: ['09:30', '10:15'], 3: ['10:25', '11:10'], 4: ['11:15', '12:00'],
    5: ['12:05', '12:50'], 6: ['13:30', '14:15'], 7: ['14:20', '15:05'], 8: ['15:15', '16:00'],
    9: ['16:05', '16:50'], 10: ['18:00', '18:45'], 11: ['18:50', '19:35'], 12: ['19:40', '20:25'],
    13: ['20:30', '21:15']
  };
  const PDF_WD = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7 };

  function parsePdfTimetable(pages, source, now) {
    now = now || new Date();
    if (!pages || !pages.length) return [];
    var all = [];
    pages.forEach(function (pg, pi) {
      var W = +pg.width || 842, H = +pg.height || 595;
      (pg.items || []).forEach(function (it) {
        var t = String(it.text || '').replace(/\s+/g, ' ').trim();
        if (!t) return;
        var x = +it.x || 0, y = +it.y || 0, w = +it.w || 0, h = +it.h || 0;
        all.push({ text: t, x: x, y: y, w: w, h: h, cx: x + w / 2, cy: y + h / 2, page: pi, W: W, H: H });
      });
    });
    // 1) 找列头：取包含最多“星期X”的一页
    var heads = [];
    pages.forEach(function (pg, pi) {
      var hs = all.filter(function (it) {
        return it.page === pi && it.cy < it.H * 0.2 && /^(星期|周)[一二三四五六日天]$/.test(it.text);
      });
      if (hs.length > heads.length) heads = hs;
    });
    if (heads.length < 3) return [];
    heads.sort(function (a, b) { return a.cx - b.cx; });
    var cols = heads.map(function (h) { return h.cx; });
    var weekdays = heads.map(function (h) { return PDF_WD[h.text.replace(/^星期|^周/, '')]; });
    var step = cols.length > 1 ? (cols[cols.length - 1] - cols[0]) / (cols.length - 1) : 120;
    var bounds = cols.map(function (c, i) {
      var l = i ? (cols[i - 1] + c) / 2 : c - step / 2;
      var r = i < cols.length - 1 ? (c + cols[i + 1]) / 2 : c + step / 2;
      return [l, r];
    });
    function colAt(cx) {
      for (var i = 0; i < bounds.length; i++) if (cx >= bounds[i][0] && cx < bounds[i][1]) return i;
      return -1;
    }
    // 2) 周次行是每个课程块的起点，如“(1-3节)2-17周/校区...”
    var weekLines = all.filter(function (it) { return /^\(\s*\d{1,2}\s*(?:-\s*\d{1,2})?\s*节\s*\)/.test(it.text); });
    var out = [];
    weekLines.forEach(function (wl) {
      var ci = colAt(wl.cx);
      if (ci < 0) return;
      var col = all.filter(function (it) { return it.page === wl.page && colAt(it.cx) === ci; });
      // 标题在周次行上方，可能折成两行（如“智科…导”+“论”）
      var above = col.filter(function (it) {
        return it.cy < wl.cy - 1 && it.cy > wl.cy - 42 && it.page === wl.page;
      }).sort(function (a, b) { return b.cy - a.cy; });
      var parts = [], lastY = wl.cy;
      above.forEach(function (it) {
        if (lastY - it.cy > 18) return;
        if (isPdfAdmin(it.text) || /^\(/.test(it.text)) return;
        if (!isPdfTitle(it.text)) return;
        parts.unshift(it.text);
        lastY = it.cy;
      });
      var course = parts.join('').replace(/\s+/g, '').replace(/^[·\-—\s]+|[·\-—\s]+$/g, '').trim();
      if (!course) return;
      // 周次行及后续几行组成完整块（周次可能折行，地点/教师在其后）
      var block = wl.text, last = wl.cy;
      col.filter(function (it) {
        return it.page === wl.page && it.cy > wl.cy - 1 && it.cy <= wl.cy + 46;
      }).sort(function (a, b) { return a.cy - b.cy; }).forEach(function (it) {
        if (it === wl) return;
        if (/^\(/.test(it.text) && it.cy > wl.cy + 2) return;
        if (it.cy - last > 16) return;
        block += it.text;
        last = it.cy;
      });
      var pm = block.match(/^\(\s*(\d{1,2})\s*(?:-\s*(\d{1,2}))?\s*节\s*\)/);
      if (!pm) return;
      var p1 = +pm[1], p2 = +pm[2] || p1;
      var t1 = PDF_PERIOD_TIMES[p1], t2 = PDF_PERIOD_TIMES[p2];
      if (!t1 || !t2) return;
      var spec = block.slice(pm[0].length).split(/\/\s*(?:校区|场地|教师|地点|教室)/)[0].trim();
      spec = spec.trim();
      var weeks = parsePdfWeeks(spec);
      var tm = block.match(/\/(?:教师|老师)\s*[:：]\s*([^\/]+)/);
      var lm = block.match(/\/(?:场地|地点|教室)\s*[:：]\s*([^\/]+)/);
      out.push({
        course: course,
        teacher: tm ? cleanPdfPart(tm[1]) : '',
        weekday: weekdays[ci],
        start: t1[0], end: t2[1],
        periods: '第' + p1 + (p2 !== p1 ? '-' + p2 : '') + '节',
        location: lm ? cleanPdfPart(lm[1]) : '',
        weeks: weeks,
        weeksText: spec ? '第' + spec : ''
      });
    });
    if (!out.length) return [];
    var merged = [];
    out.forEach(function (o) {
      var f = merged.filter(function (x) { return x.course === o.course; })[0];
      if (!f) { f = { course: o.course, teacher: o.teacher, sessions: [], schedule: '' }; merged.push(f); }
      if (!f.teacher && o.teacher) f.teacher = o.teacher;
      var same = f.sessions.filter(function (s) {
        return s.weekday === o.weekday && s.start === o.start && s.end === o.end && s.location === o.location;
      })[0];
      if (same) {
        if (o.weeks && o.weeks.length) {
          var set = {}; (same.weeks || []).concat(o.weeks).forEach(function (w) { set[w] = 1; });
          same.weeks = Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
          same.weeksText = same.weeksText || o.weeksText;
        }
      } else {
        f.sessions.push({
          weekday: o.weekday, start: o.start, end: o.end, location: o.location,
          periods: o.periods, weeks: o.weeks, weeksText: o.weeksText
        });
      }
      var sched = WD_NAMES[o.weekday] + ' ' + o.start + '-' + o.end + (o.location ? ' · ' + o.location : '');
      if (f.schedule.indexOf(sched) < 0) f.schedule += (f.schedule ? ' / ' : '') + sched;
    });
    return merged.slice(0, 24).map(function (o) {
      return {
        id: uid('crs'), course: o.course, teacher: o.teacher, platforms: [], tasks: [], group_info: null,
        schedule: o.schedule, sessions: o.sessions,
        confidence: { course: 0.9, teacher: o.teacher ? 0.86 : 0.4, platforms: 0.3, tasks: 0.3 },
        source: source || 'PDF 课表', raw_text: 'PDF 课表（按文本坐标还原）',
        created_at: iso(now), updated_at: iso(now)
      };
    });
  }

  function isPdfAdmin(t) {
    return /^[\/:：]/.test(t) || /^(校区|场地|教师|教学班|考核方式|课程学时|选课备注|学号|打印时间|备注)/.test(t) ||
      /^[A-Z]\d{6,}/.test(t) || /^\d{6,}/.test(t) || /学分|学时|周学时|总学时/.test(t);
  }
  function isPdfTitle(t) {
    if (!/^[\u4e00-\u9fa5A-Za-z《》（）()·\-\d\s]{2,32}$/.test(t)) return false;
    if (/^(星期|周)[一二三四五六日天]$/.test(t)) return false;
    if (/周|节|校区|教师|场地|学分|学时|考核|教学班|打印|学号/.test(t)) return false;
    return true;
  }
  function cleanPdfPart(s) {
    return String(s || '').replace(/[,，。;；\s]+/g, '').replace(/^\/+|\/+$/g, '').trim();
  }
  function parsePdfWeeks(spec) {
    var weeks = [], re = /(\d{1,2})(?:\s*-\s*(\d{1,2}))?\s*周\s*(?:[（(]([单双])[）)])?/g, m;
    while ((m = re.exec(spec))) {
      var a = +m[1], b = +m[2] || a, flag = m[3] || '';
      for (var w = a; w <= b; w++) {
        if (flag === '单' && w % 2 === 0) continue;
        if (flag === '双' && w % 2 !== 0) continue;
        if (weeks.indexOf(w) < 0) weeks.push(w);
      }
    }
    return weeks.sort(function (a, b) { return a - b; });
  }

  // 返回每列的 [y0,y1] 彩色块；文字造成的短缺口合并，相邻不同颜色的课块分开
  function imageColorRuns(img, bounds, W, H) {
    var maxW = 900;
    var scale = Math.min(1, maxW / W);
    var cw = Math.max(1, Math.round(W * scale)), ch = Math.max(1, Math.round(H * scale));
    var cv = document.createElement('canvas');
    cv.width = cw; cv.height = ch;
    var ctx = cv.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, cw, ch);
    var data;
    try { data = ctx.getImageData(0, 0, cw, ch).data; } catch (e) { return null; }
    var out = [];
    bounds.forEach(function (bd) {
      var x0 = Math.max(1, Math.floor(bd[0] * scale)), x1 = Math.min(cw - 2, Math.ceil(bd[1] * scale));
      if (x1 <= x0 + 4) { out.push([]); return; }
      var xs = [0.12, 0.3, 0.5, 0.7, 0.88].map(function (p) { return Math.round(x0 + (x1 - x0) * p); });
      var raw = [], inRun = false, start = 0, lastOn = 0, col = [0, 0, 0];
      for (var y = Math.floor(ch * 0.08); y < Math.floor(ch * 0.995); y++) {
        var on = 0, sr = 0, sg = 0, sb = 0, sn = 0;
        for (var xi = 0; xi < xs.length; xi++) {
          var i = (y * cw + xs[xi]) * 4;
          var r = data[i], g = data[i + 1], bl = data[i + 2];
          var mx = Math.max(r, g, bl), mn = Math.min(r, g, bl);
          if (mx > 224 && (mx - mn) > 14) { on++; sr += r; sg += g; sb += bl; sn++; }
        }
        var filled = on >= 2;
        if (filled) {
          if (!inRun) { start = y; inRun = true; }
          lastOn = y;
          if (sn) col = [sr / sn, sg / sn, sb / sn];
        } else if (inRun) {
          if (y - lastOn > 2) {
            if (lastOn - start > ch * 0.012) raw.push([start, lastOn, col[0], col[1], col[2]]);
            inRun = false;
          }
        }
      }
      if (inRun && lastOn - start > ch * 0.012) raw.push([start, lastOn, col[0], col[1], col[2]]);
      var merged = [];
      raw.forEach(function (r) {
        var prev = merged[merged.length - 1];
        if (prev && (r[0] - prev[1]) <= ch * 0.014) prev[1] = r[1];
        else merged.push([r[0], r[1]]);
      });
      // 同一列相邻课块可能只隔几像素；按颜色突变再切开（文字是暗色，不计入平均色）
      var final = [];
      merged.forEach(function (run) {
        var segStart = run[0], base = null, changeAt = -1;
        for (var y = run[0]; y <= run[1]; y++) {
          var sr = 0, sg = 0, sb = 0, sn = 0;
          for (var xi2 = 0; xi2 < xs.length; xi2++) {
            var ii = (y * cw + xs[xi2]) * 4;
            var rr = data[ii], gg = data[ii + 1], bb = data[ii + 2];
            var mxx = Math.max(rr, gg, bb), mnn = Math.min(rr, gg, bb);
            if (mxx > 224 && (mxx - mnn) > 14) { sr += rr; sg += gg; sb += bb; sn++; }
          }
          if (!sn) continue;
          var cur = [sr / sn, sg / sn, sb / sn];
          if (!base) { base = cur; continue; }
          var dist = Math.abs(base[0] - cur[0]) + Math.abs(base[1] - cur[1]) + Math.abs(base[2] - cur[2]);
          if (dist > 60) {
            if (changeAt < 0) changeAt = y;
            if (y - changeAt > 18) {
              final.push([segStart / scale, changeAt / scale]);
              segStart = changeAt; base = cur; changeAt = -1;
            }
          } else {
            changeAt = -1;
          }
        }
        final.push([segStart / scale, run[1] / scale]);
      });
      out.push(final);
    });
    return out;
  }

  /* ---------- iCal ---------- */
  function parseICS(text, source, now) {
    now = now || new Date();
    const raw = String(text || '').replace(/\r\n?/g, '\n');
    if (!/BEGIN:VCALENDAR/i.test(raw)) throw new Error('不是有效的 iCal 文件');
    // 展开折行
    const unfolded = raw.replace(/\n[ \t]/g, '');
    const events = [];
    const re = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/g;
    let m;
    while ((m = re.exec(unfolded))) {
      const body = m[1];
      const get = k => {
        const mm = body.match(new RegExp('^' + k + '[^:]*:(.*)$', 'mi'));
        return mm ? mm[1].trim() : '';
      };
      const summary = get('SUMMARY');
      const dt = get('DTSTART');
      if (!summary || !dt) continue;
      events.push({ summary, dt, location: get('LOCATION'), description: get('DESCRIPTION') });
    }
    if (!events.length) throw new Error('iCal 里没有日程（VEVENT）');
    const courses = [];
    events.slice(0, 120).forEach(ev => {
      const dm = ev.dt.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/);
      if (!dm) return;
      const d = new Date(+dm[1], +dm[2] - 1, +dm[3], +(dm[4] || 8), +(dm[5] || 0), 0);
      const isTask = /作业|截止|提交|考试|论文|报告|quiz|assignment|deadline/i.test(ev.summary);
      let taskName = ev.summary;
      let course = ev.summary;
      if (isTask) {
        const km = ev.summary.match(/^([\u4e00-\u9fa5]{2,12}?)\s*(实验|作业|习题|考试|测验|报告|论文|任务|quiz|assignment|deadline)/i);
        if (km) {
          course = km[1].trim();
          taskName = ev.summary.slice(km[0].length - km[2].length).replace(/^[:：\s]+/, '').trim();
        } else {
          const cm = ev.summary.match(/^[\u4e00-\u9fa5]{2,10}/);
          course = cm ? cm[0] : '未命名课程';
        }
      }
      course = course.replace(/[（(].*?[)）]/g, '').trim() || '未命名课程';
      let c = courses.find(x => x.course === course);
      if (!c) {
        c = {
          id: uid('crs'), course, teacher: '', platforms: [], tasks: [], group_info: null, schedule: '',
          confidence: { course: 0.75, teacher: 0.3, platforms: 0.3, tasks: isTask ? 0.8 : 0.3 },
          source: source || 'iCal 导入', raw_text: text, created_at: iso(now), updated_at: iso(now)
        };
        courses.push(c);
      }
      if (isTask) {
        c.tasks.push({
          id: uid('tk'), name: (taskName || ev.summary).replace(/^[\s:：]+/, '').slice(0, 28),
          deadline: iso(d), platform: '', type: /考试/.test(ev.summary) ? '考试' : '作业',
          status: '未完成', confidence: 0.8, deadlineConfidence: dm[4] ? 0.9 : 0.7
        });
        c.confidence.tasks = 0.8;
      } else {
        const wd = '日一二三四五六'[d.getDay()];
        const slot = pad(d.getHours()) + ':' + pad(d.getMinutes());
        const seg = '周' + wd + ' ' + slot;
        if (!c.schedule.includes(seg)) c.schedule = c.schedule ? c.schedule + ' / ' + seg : seg;
        if (ev.location && !c.schedule.includes(ev.location)) c.schedule += ' · ' + ev.location;
        c.sessions = c.sessions || [];
        if (!c.sessions.some(x => x.weekday === (d.getDay() || 7) && x.start === slot && x.location === (ev.location || ''))) {
          c.sessions.push({ weekday: d.getDay() || 7, start: slot, end: '', location: ev.location || '', periods: '' });
        }
      }
    });
    return courses;
  }

  /* ---------- 演示数据 ---------- */
  function demo(now) {
    now = now || new Date();
    const d = (days, h, mi) => {
      const x = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, h, mi, 0);
      return iso(x);
    };
    const base = (course, teacher, platforms, tasks, group, schedule) => ({
      id: uid('crs'), course, teacher, platforms, tasks, group_info: group || null, schedule: schedule || '',
      confidence: { course: 0.96, teacher: 0.9, platforms: 0.88, tasks: 0.85 },
      source: '示例数据', raw_text: '（演示用示例数据，可在“我的 → 数据”里一键清空）',
      created_at: iso(now), updated_at: iso(now)
    });
    return [
      base('大学英语', '王老师', [
        { id: uid('pf'), name: '学习通', purpose: '提交作业', entry_type: 'web', entry_value: 'https://i.chaoxing.com', fallback: '复制链接', status: '可用' },
        { id: uid('pf'), name: '雨课堂', purpose: '签到', entry_type: 'web', entry_value: 'https://www.yuketang.cn/web', fallback: '复制链接', status: '可用' }
      ], [
        { id: uid('tk'), name: 'Unit 5 读书报告', deadline: d(2, 23, 59), platform: '学习通', type: '作业', status: '未完成', confidence: 0.9, remind: true },
        { id: uid('tk'), name: '听力打卡', deadline: d(0, 22, 0), platform: '雨课堂', type: '签到', status: '未完成', confidence: 0.85, remind: true }
      ], { type: 'QQ群', value: '123456789', fallback: '复制群号' }, '周二 3-4 节 · 教一 201'),
      base('高等数学', '李老师', [
        { id: uid('pf'), name: '学习通', purpose: '查看通知、下载资料', entry_type: 'web', entry_value: 'https://i.chaoxing.com', fallback: '复制链接', status: '可用' }
      ], [
        { id: uid('tk'), name: '习题 3.2', deadline: d(1, 20, 0), platform: '学习通', type: '作业', status: '未完成', confidence: 0.82, remind: true }
      ], null, '周一 1-2 节 · 教二 305'),
      base('程序设计基础', '张老师', [
        { id: uid('pf'), name: '雨课堂', purpose: '提交作业、查看通知', entry_type: 'web', entry_value: 'https://www.yuketang.cn/web', fallback: '复制链接', status: '可用' }
      ], [
        { id: uid('tk'), name: '实验二：链表', deadline: d(4, 23, 59), platform: '雨课堂', type: '作业', status: '未完成', confidence: 0.88, remind: true }
      ], { type: 'QQ群', value: '987654321', fallback: '复制群号' }, '周四 5-6 节 · 实验楼 402')
    ];
  }

  global.Parser = { extract, parseDeadline, parseTimetable, parseTimetableImage, parsePdfTimetable, parseICS, demo, uid, iso, norm, PLATFORMS };
})(window);
