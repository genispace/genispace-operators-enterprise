#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PDF 表格提取脚本 - 基于 pdfplumber
从 PDF 文件中提取表格数据，支持结构化表格
输出 JSON 到 stdout，供 Node.js 调用
"""

import pdfplumber
import json
import re
import sys
import os


def clean_text(text):
    """清理单元格文本：去除多余空白、换行符等"""
    if text is None:
        return ""
    return re.sub(r'\s+', ' ', str(text).strip())


def is_header_row(row, header_names=None):
    """
    判断是否为表头行。
    若提供 header_names（前三列列头名称列表），则当行前三列分别包含对应列头时视为表头；
    否则使用默认关键词（年、月、凭证号）判断。
    """
    if not row:
        return False
    cleaned = [clean_text(c) for c in row[:3]]  # 仅取前三列
    names = [h.strip() for h in (header_names or [])[:3] if h and str(h).strip()]
    if names:
        # 配置了列头：前三列分别包含对应列头即视为表头
        return all(
            names[i] in (cleaned[i] if i < len(cleaned) else "")
            for i in range(len(names))
        )
    # 默认逻辑
    first_cell = (cleaned[0] if cleaned else "").lower()
    row_text = clean_text("".join(str(c) for c in row if c))
    return "年" in first_cell or "月" in first_cell or "凭证号" in row_text


DEFAULT_OUTPUT_COLUMNS = [
    "year", "month", "day", "voucher_no", "summary",
    "counterparty", "debit", "credit", "direction", "balance"
]


def parse_pdf_file(pdf_path, header_names=None, output_columns=None):
    """解析 PDF 文件，返回记录列表。
    header_names: 前三列列头名称列表，用于排除表头行
    output_columns: 输出字段名列表（按列顺序），如 ["year","month","day",...]，不传则用默认
    """
    all_records = []

    with pdfplumber.open(pdf_path) as pdf:
        for page_num, page in enumerate(pdf.pages, start=1):
            # 提取表格（依赖 PDF 中的线条）
            tables = page.extract_tables(
                table_settings={
                    "vertical_strategy": "lines",
                    "horizontal_strategy": "lines",
                    "snap_tolerance": 3,
                }
            )

            for table in tables:
                if not table or len(table) < 2:
                    continue

                for row in table:
                    # 跳过空行或表头
                    if not any(cell for cell in row):
                        continue
                    if is_header_row(row, header_names):
                        continue

                    # 清理所有单元格
                    cleaned_row = [clean_text(cell) for cell in row]

                    # 按 output_columns 配置动态构建记录
                    columns = output_columns or DEFAULT_OUTPUT_COLUMNS
                    max_cols = max(len(columns), len(cleaned_row))
                    padded_row = cleaned_row + [""] * (max_cols - len(cleaned_row))
                    record = {}
                    for i, col_name in enumerate(columns):
                        record[col_name] = padded_row[i] if i < len(padded_row) else ""
                    all_records.append(record)

    return all_records


def main():
    if len(sys.argv) < 2:
        error = {"error": "缺少 PDF 文件路径参数", "records": []}
        print(json.dumps(error, ensure_ascii=False))
        sys.exit(1)

    pdf_path = sys.argv[1]
    if not os.path.exists(pdf_path):
        error = {"error": f"文件不存在: {pdf_path}", "records": []}
        print(json.dumps(error, ensure_ascii=False))
        sys.exit(1)

    # 可选：第三参数为前三列列头名称，逗号分隔，如 "年,月,日"
    header_names = None
    if len(sys.argv) >= 3 and sys.argv[2]:
        header_names = [s.strip() for s in sys.argv[2].split(",") if s.strip()]

    # 可选：第四参数为输出列名，逗号分隔，如 "year,month,day,voucher_no,summary,counterparty,debit,credit,direction,balance"
    output_columns = None
    if len(sys.argv) >= 4 and sys.argv[3]:
        output_columns = [s.strip() for s in sys.argv[3].split(",") if s.strip()]

    try:
        records = parse_pdf_file(pdf_path, header_names, output_columns)
        result = {"records": records, "error": None}
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        error = {"error": str(e), "records": []}
        print(json.dumps(error, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
