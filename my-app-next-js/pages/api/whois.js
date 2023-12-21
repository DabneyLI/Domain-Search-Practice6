import { supabase } from "../../utils/supabaseClient";

export default async function handler(req, res) {
  const { query } = req.query;
  if (!query) {
    return res.status(400).json({ error: "Domain query is required" });
  }

  // 拆分输入的域名和后缀
  let [name, ...inputSuffix] = query.split(".");
  inputSuffix = inputSuffix.join("."); // 处理可能的多级后缀

  // 定义所有支持的后缀
  const allSuffixes = [
    "com",
    "net",
    "org",
    "me",
    "xyz",
    "info",
    "io",
    "co",
    "ai",
    "biz",
    "us",
  ];
  // 如果输入了后缀，确保它是第一个被查询的
  if (inputSuffix) {
    allSuffixes.unshift(inputSuffix);
  }

  const domainResults = [];

  // 对每个后缀进行查询
  for (const suffix of allSuffixes) {
    const domain = `${name}.${suffix}`;
    try {
      let { data: records, error: fetchError } = await supabase
        .from("queries")
        .select("*")
        .eq("domain", domain);

      if (fetchError) throw fetchError;

      let recentRecord = records.find(
        (r) => new Date() - new Date(r.timestamp) < 86400000,
      );
      if (recentRecord) {
        // 更新时间戳
        const { error: updateError } = await supabase
          .from("queries")
          .update({ timestamp: new Date().toISOString() })
          .match({ id: recentRecord.id });

        if (updateError) throw updateError;
        domainResults.push(recentRecord);
      } else {
        // 执行新的 WHOIS 查询
        const response = await fetch(
          `https://whois.freeaiapi.xyz/?name=${name}&suffix=${suffix}`,
        );
        if (!response.ok) continue;

        const whoisData = await response.json();
        if (whoisData.status !== "ok") continue;

        let newRecord = {
          domain,
          registered: whoisData.available,
          timestamp: new Date().toISOString(),
          // 这里添加了从响应中获取的其他WHOIS信息
        };

        const { error: insertError } = await supabase
          .from("queries")
          .insert([newRecord]);

        if (insertError) throw insertError;
        domainResults.push(newRecord);
      }
    } catch (error) {
      // 记录错误但继续处理
      console.error(`Error with domain ${domain}:`, error.message);
      domainResults.push({ domain, error: error.message });
    }
  }

  // 返回所有查询的结果
  return res.status(200).json(domainResults);
}
