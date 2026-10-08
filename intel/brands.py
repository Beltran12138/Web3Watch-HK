"""品牌词典：从 SFC 持牌机构的中英文名推断内地母品牌，以及在新闻 / 帖子标题里认出机构。

- infer(corp)        机构名 → (母品牌, 类型, 置信度)。中文名与英文名各自独立匹配：
                     高 = 两路指向同一品牌；中 = 只有一路命中（或中文别名 ≥3 字）；低 = 只有 2 字中文简称命中
- text_hits(text)    自由文本 → 命中的品牌（竞品用 COMPETITORS，内地机构用 BRANDS）

⚠ 词典按公开常识编写，只覆盖头部机构；长尾机构会漏（漏 ≠ 不是）。
首轮审计（2026-10-07）：子串匹配让「E Fund」命中「The Fund」、「CITIC」命中「Citicorp」，
中置信准确率只有 38%；改为中文前缀匹配 + 英文整词匹配后约 70%，高置信抽查 30/30。
"""
import re

import zhconv

# (母品牌, 类型, 中文别名[简体], 英文关键词)  —— 同一前缀的长名放前面由排序保证
BRANDS = [
    # 银行系（香港子公司常用「X银国际」简称）
    ("中国银行", "银行", ["中银", "中国银行"], ["BOCI", "Bank of China"]),
    ("交通银行", "银行", ["交银", "交通银行"], ["BOCOM", "Bank of Communications"]),
    ("工商银行", "银行", ["工银", "工商银行"], ["ICBC", "Industrial and Commercial Bank"]),
    ("建设银行", "银行", ["建银", "建设银行"], ["CCB"]),
    ("农业银行", "银行", ["农银", "农业银行"], ["ABCI", "Agricultural Bank"]),
    ("招商银行", "银行", ["招银", "招商银行"], ["CMB International", "China Merchants Bank", "CMBI"]),
    ("浦发银行", "银行", ["浦银", "浦发"], ["SPDB"]),
    ("民生银行", "银行", ["民银", "民生银行"], ["CMBC", "Minsheng"]),
    ("中信银行", "银行", ["中信银行", "信银"], ["CNCB", "China CITIC Bank"]),
    ("兴业银行", "银行", ["兴业银行", "兴银"], ["Industrial Bank"]),
    ("光大银行", "银行", ["光大银行"], ["China Everbright Bank"]),
    ("平安银行", "银行", ["平安银行"], ["Ping An Bank"]),
    # 券商
    ("中信建投", "券商", ["中信建投"], ["China Securities (International)", "CSCI"]),
    ("中信证券", "券商", ["中信证券", "中信里昂"], ["CITIC Securities", "CLSA"]),
    ("国泰君安", "券商", ["国泰君安"], ["Guotai Junan"]),
    ("海通证券", "券商", ["海通"], ["Haitong"]),
    ("华泰证券", "券商", ["华泰"], ["Huatai"]),
    ("广发证券", "券商", ["广发"], ["GF "]),
    ("招商证券", "券商", ["招商证券", "招证"], ["China Merchants Securities", "CMS "]),
    ("申万宏源", "券商", ["申万宏源", "申万", "宏源"], ["Shenwan", "SWS"]),
    ("中金公司", "券商", ["中金", "中国国际金融"], ["CICC", "China International Capital Corporation"]),
    ("国信证券", "券商", ["国信证券"], ["Guosen"]),
    ("光大证券", "券商", ["光大证券"], ["Everbright Securities"]),
    ("东方证券", "券商", ["东方证券"], ["Orient Securities"]),
    ("兴业证券", "券商", ["兴证国际", "兴业证券"], ["Industrial Securities"]),
    ("长江证券", "券商", ["长江证券"], ["Changjiang"]),
    ("方正证券", "券商", ["方正证券"], ["Founder Securities"]),
    ("东吴证券", "券商", ["东吴"], ["Soochow"]),
    ("国元证券", "券商", ["国元"], ["Guoyuan"]),
    ("国金证券", "券商", ["国金证券"], ["Sinolink"]),
    ("安信证券", "券商", ["安信"], ["Essence"]),
    ("天风证券", "券商", ["天风"], ["TFI ", "TF International", "Tianfeng"]),
    ("中泰证券", "券商", ["中泰"], ["Zhongtai"]),
    ("财通证券", "券商", ["财通"], ["Caitong"]),
    ("浙商证券", "券商", ["浙商"], ["Zheshang"]),
    ("第一创业", "券商", ["第一创业"], ["First Capital"]),
    ("国联证券", "券商", ["国联"], ["Guolian"]),
    ("信达证券", "券商", ["信达证券"], ["Cinda Securities"]),
    ("西部证券", "券商", ["西部证券"], ["Western Securities"]),
    ("华西证券", "券商", ["华西证券"], ["Huaxi"]),
    ("东北证券", "券商", ["东北证券"], ["Northeast Securities"]),
    ("华福证券", "券商", ["华福"], ["Huafu"]),
    ("山西证券", "券商", ["山西证券"], ["Shanxi Securities"]),
    # 公募
    ("华夏基金", "公募", ["华夏基金"], ["^China Asset Management", "ChinaAMC"]),
    ("嘉实基金", "公募", ["嘉实"], ["Harvest Global"]),
    ("博时基金", "公募", ["博时"], ["Bosera"]),
    ("南方基金", "公募", ["南方东英", "南方基金"], ["CSOP", "Southern Asset"]),
    ("易方达", "公募", ["易方达"], ["E Fund"]),
    ("汇添富", "公募", ["汇添富"], ["China Universal"]),
    ("富国基金", "公募", ["富国基金"], ["Fullgoal"]),
    ("鹏华基金", "公募", ["鹏华"], ["Penghua"]),
    ("工银瑞信", "公募", ["工银瑞信"], ["ICBC Credit Suisse", "ICBC UBS"]),
    ("华安基金", "公募", ["华安基金"], ["Hua An"]),
    ("银华基金", "公募", ["银华"], ["Yinhua"]),
    ("大成基金", "公募", ["大成"], ["Dacheng"]),
    ("招商基金", "公募", ["招商基金"], ["China Merchants Fund"]),
    ("海富通", "公募", ["海富通"], ["HFT Investment"]),
    ("华宝基金", "公募", ["华宝"], ["Hwabao"]),
    ("中欧基金", "公募", ["中欧"], ["Zhong Ou"]),
    ("兴证全球", "公募", ["兴证全球", "兴全"], ["Aegon-Industrial"]),
    ("天弘基金", "公募", ["天弘"], ["Tianhong"]),
    ("前海开源", "公募", ["前海开源"], ["Qianhai Kaiyuan"]),
    ("国投瑞银", "公募", ["国投瑞银"], ["UBS SDIC"]),
    ("景顺长城", "公募", ["景顺长城"], ["Invesco Great Wall"]),
    # 保险 / AMC / 综合金控
    ("中国平安", "保险", ["平安"], ["Ping An"]),
    ("中国太平", "保险", ["中国太平", "太平资产", "太平金融"], ["Taiping"]),
    ("中国人寿", "保险", ["国寿", "中国人寿"], ["China Life"]),
    ("中国人保", "保险", ["人保"], ["PICC"]),
    ("太平洋保险", "保险", ["太平洋保险", "太保"], ["CPIC"]),
    ("中国信达", "AMC", ["信达"], ["Cinda"]),
    ("中国华融", "AMC", ["华融"], ["Huarong"]),
    ("中国东方资产", "AMC", ["东方资产"], ["China Orient"]),
    ("中国长城资产", "AMC", ["长城资产"], ["Great Wall Asset"]),
    ("中信集团", "综合", ["中信资本", "中信"], ["CITIC"]),
    ("中国光大", "综合", ["光大"], ["Everbright"]),
    ("华润", "综合", ["华润"], ["China Resources"]),
    ("越秀", "综合", ["越秀"], ["Yuexiu"]),
    ("华兴资本", "综合", ["华兴"], ["China Renaissance"]),
    ("新华保险", "保险", ["新华资产", "新华保险"], ["New China Asset Management", "New China Life"]),
    ("国新", "综合", ["国新"], ["China Reform"]),
]

# 中文别名按长度降序；英文关键词同理 —— 「中信建投」先于「中信」、「平安银行」先于「平安」
ZH = sorted(((a, b) for b in BRANDS for a in b[2]), key=lambda x: -len(x[0]))
EN = sorted(((k.lower(), b) for b in BRANDS for k in b[3]), key=lambda x: -len(x[0]))


def match_zh(zh):
    """中文别名必须在名字开头（可带「中国」前缀）。首轮审计：名中间命中（智易东方证券、南华融资、创兴银行）几乎全错。
    返回 (品牌, 命中的别名)。"""
    s = zhconv.convert(zh or "", "zh-cn")
    s = s[2:] if s.startswith("中国") and not any(s.startswith(a) for a, _ in ZH if a.startswith("中国")) else s
    for alias, b in ZH:
        if s.startswith(alias):
            return b, alias
    return None, None


def match_en(en):
    """英文关键词整词匹配。首轮审计：子串匹配让「E Fund」命中「The Fund」、「CITIC」命中「Citicorp」。"""
    s = (en or "").lower()
    for key, b in EN:
        if key.startswith("^"):  # 只匹配开头：「Ping An of China Asset Management」不应命中华夏
            if s.startswith(key[1:]):
                return b
        elif re.search(r"(?<![a-z])" + re.escape(key.strip()) + r"(?![a-z])", s):
            return b
    return None


def infer(s):
    zh = s.get("nameChi") if s.get("nameChi") not in (None, "\x00") else ""
    bz, alias = match_zh(zh)
    be = match_en(s.get("name"))
    if bz and be:
        if bz[0] == be[0]:
            return bz, "高"
        if bz[1] == "综合" or be[1] == "综合":  # 一路命中具体子品牌、一路命中集团：取具体的
            return (be if bz[1] == "综合" else bz), "中"
        return bz, f"冲突（英文名指向{be[0]}）"
    if be:
        return be, "中"
    if bz:  # 只有中文命中：别名 ≥3 字算中，2 字简称歧义大（大成功证券、安信评级）降为低
        return bz, "中" if len(alias) >= 3 else "低"
    return None, ""



# ---------- 自由文本（新闻标题 / 帖子） ----------
COMPETITORS = {  # 品牌 → (文本里的写法, SFC 英文名正则)
    "HashKey": (r"hashkey", r"\bHashKey\b|\bHash Blockchain\b"),
    "OSL": (r"\bosl\b|osldotcom|osl_hk", r"^OSL\b"),
    "EX.IO": (r"\bex\.io\b|exio_hk", None),
    "HKbitEX": (r"hkbitex|hong kong digital asset ex", r"^Hong Kong Digital Asset EX\b"),
    "Bullish": (r"\bbullish\b", r"^Bullish HK\b"),
    "Victory": (r"victory (fintech|securities)|vdx", r"^Victory (Fintech|Securities)\b"),
    "Futu": (r"\bfutu\b|富途|moomoo", r"^Futu\b"),
    "Tiger": (r"tiger brokers|老虎证券|\bup fintech\b", r"^Tiger Brokers\b"),
    "Longbridge": (r"longbridge|long bridge|长桥", r"^Long Bridge\b"),
}


def text_patterns():
    """(品牌, 类型, 正则)。中文别名做子串，英文关键词做整词；太短的英文缩写不用（自由文本误伤比机构名高）。"""
    pats = [(b, "竞品", re.compile(t, re.I)) for b, (t, _) in COMPETITORS.items()]
    for brand, kind, zh, en in BRANDS:
        alts = [re.escape(a) for a in zh if len(a) >= 2]
        alts += [r"(?<![A-Za-z])" + re.escape(k.lstrip("^").strip()) + r"(?![A-Za-z])" for k in en if len(k.lstrip("^").strip()) >= 4]
        if alts:
            pats.append((brand, kind, re.compile("|".join(alts), re.I)))
    return pats


def firm_rank(f):
    """同一品牌下多家持牌主体：VATP > 有 VA 交易条款 > 有 1 号牌（券商主体）> 其余。"""
    return ("VATP" not in f["ras"], "VA交易" not in f["va"], "T1" not in f["ras"], f["ce"])


def text_hits(text, pats, firms, parent):
    """firms: {ce: {ce,en,zh,ras,va}}；parent: {品牌: [ce, …]}。只看传进来的文本，别把媒体名 / 账号名拼进来
    （2026-10-08：「中金在线」被认成中金公司、「富途牛牛」频道被认成富途）。"""
    hits = []
    for brand, kind, rx in pats:
        if not rx.search(text):
            continue
        if kind == "竞品":
            name_rx = COMPETITORS[brand][1]
            ces = [ce for ce, f in firms.items() if name_rx and re.search(name_rx, f["en"], re.I)]
        else:
            ces = parent.get(brand, [])
        hits.append({"brand": brand, "kind": kind,
                     "firms": sorted((firms[ce] for ce in ces if ce in firms), key=firm_rank)[:6]})
    return hits
