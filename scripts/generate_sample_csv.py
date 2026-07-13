#!/usr/bin/env python3
"""Generate sample financial transaction CSVs of a target size."""

from __future__ import annotations

import argparse
import csv
import random
import re
import sys
from datetime import date, timedelta
from pathlib import Path

COLUMNS = [
    "date",
    "description",
    "category",
    "amount",
    "type",
    "vendor_customer",
    "invoice_id",
    "payment_method",
    "notes",
    "currency",
]

CATEGORIES = {
    "revenue": ["sales", "subscription", "consulting", "refund_in"],
    "expense": ["payroll", "software", "marketing", "office", "travel"],
}

VENDORS = [
    "Acme Corp",
    "Northwind",
    "Globex",
    "Initech",
    "Umbrella",
    "Stark Industries",
    "Wayne Enterprises",
]

PAYMENT_METHODS = ["ach", "card", "wire", "check", "cash"]
CURRENCIES = ["USD", "USD", "USD", "EUR", "GBP"]  # mostly USD


def parse_size(value: str) -> int:
    """Parse size strings like 100kb, 1mb, 5mb into bytes."""
    cleaned = value.strip().lower().replace(" ", "")
    match = re.fullmatch(r"(\d+(?:\.\d+)?)(b|kb|mb|gb)?", cleaned)
    if not match:
        raise argparse.ArgumentTypeError(
            f"Invalid size '{value}'. Use e.g. 100kb, 1mb, 5mb, 10mb"
        )
    amount = float(match.group(1))
    unit = match.group(2) or "b"
    multipliers = {"b": 1, "kb": 1024, "mb": 1024**2, "gb": 1024**3}
    return int(amount * multipliers[unit])


def make_row(rng: random.Random, day: date, invalid: bool = False) -> list[str]:
    tx_type = rng.choice(["revenue", "expense"])
    category = rng.choice(CATEGORIES[tx_type])
    amount = round(rng.uniform(5, 5000), 2)
    description = f"{category.replace('_', ' ').title()} — {rng.randint(1000, 9999)}"
    vendor = rng.choice(VENDORS)
    invoice = f"INV-{rng.randint(10000, 99999)}"
    payment = rng.choice(PAYMENT_METHODS)
    notes = rng.choice(["", "net-30", "priority", "reconciled"])
    currency = rng.choice(CURRENCIES)

    date_str = day.isoformat()
    amount_str = f"{amount:.2f}"
    type_str = tx_type

    if invalid:
        kind = rng.choice(["bad_date", "bad_amount", "bad_type", "missing_desc"])
        if kind == "bad_date":
            date_str = "13/40/2026"
        elif kind == "bad_amount":
            amount_str = "-12.50"
        elif kind == "bad_type":
            type_str = "transfer"
        else:
            description = ""

    return [
        date_str,
        description,
        category,
        amount_str,
        type_str,
        vendor,
        invoice,
        payment,
        notes,
        currency,
    ]


def generate(path: Path, target_bytes: int, seed: int, invalid: bool) -> None:
    rng = random.Random(seed)
    path.parent.mkdir(parents=True, exist_ok=True)
    start = date(2024, 1, 1)

    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(COLUMNS)

        bytes_written = handle.tell()
        row_index = 0
        invalid_every = 50 if invalid else None

        while bytes_written < target_bytes:
            day = start + timedelta(days=rng.randint(0, 900))
            make_invalid = bool(
                invalid_every and row_index > 0 and row_index % invalid_every == 0
            )
            writer.writerow(make_row(rng, day, invalid=make_invalid))
            bytes_written = handle.tell()
            row_index += 1

            if row_index % 5000 == 0:
                print(
                    f"\r  {row_index:,} rows, {bytes_written / 1024:.1f} KB...",
                    end="",
                    file=sys.stderr,
                )

    size_mb = path.stat().st_size / (1024 * 1024)
    print(
        f"\nWrote {row_index:,} rows → {path} ({size_mb:.2f} MB)",
        file=sys.stderr,
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate sample transaction CSVs for the financial processor."
    )
    parser.add_argument(
        "--size",
        type=parse_size,
        required=True,
        help="Target file size, e.g. 100kb, 1mb, 5mb, 10mb",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Output path (default: samples/transactions_<size>.csv)",
    )
    parser.add_argument("--seed", type=int, default=42, help="RNG seed")
    parser.add_argument(
        "--invalid",
        action="store_true",
        help="Inject invalid rows periodically for failure-path testing",
    )
    args = parser.parse_args()

    if args.out is None:
        label = (
            f"{args.size}b"
            if args.size < 1024
            else (
                f"{args.size // 1024}kb"
                if args.size < 1024**2
                else f"{args.size // (1024**2)}mb"
            )
        )
        suffix = "_invalid" if args.invalid else ""
        args.out = Path("samples") / f"transactions_{label}{suffix}.csv"

    generate(args.out, args.size, args.seed, args.invalid)


if __name__ == "__main__":
    main()
