"""Train, evaluate and export a small multiclass forest; no Python at runtime."""
import argparse
import csv
import json
from pathlib import Path
from datetime import datetime, timezone
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score, confusion_matrix, classification_report

ROOT = Path(__file__).resolve().parents[1]
FEATURES = ['log_out', 'log_in', 'log_pps', 'log_ratio', 'log_duration', 'service']

def features(outbound, inbound, packets, duration, port):
    return [np.log10(1 + max(0, outbound)), np.log10(1 + max(0, inbound)), np.log10(1 + packets / max(.1, duration / 1000)), np.log10(1 + outbound / max(1, inbound)), np.log10(1 + duration), port / 65535]

def synthetic(seed=42, count=8000):
    rng = np.random.default_rng(seed)
    x, y = [], []
    for _ in range(count):
        label = rng.choice(['benign', 'scan', 'flood', 'exfiltration'], p=[.55, .15, .15, .15])
        port = int(rng.choice([22, 53, 80, 443, 445, 3389]))
        if label == 'benign':
            outbound, inbound = 10 ** rng.normal(3.2, .55), 10 ** rng.normal(3.9, .55)
            duration = 10 ** rng.normal(3.1, .4)
            packets = max(1, (outbound + inbound) / rng.uniform(400, 1500))
        elif label == 'scan':
            outbound, inbound = rng.uniform(30, 250), rng.uniform(0, 100)
            duration, packets = rng.uniform(20, 800), rng.uniform(1, 4)
            port = int(rng.integers(1, 65535))
        elif label == 'flood':
            duration = rng.uniform(100, 5000)
            packets = 10 ** rng.uniform(4.1, 5.7) * duration / 1000
            outbound, inbound = packets * 60, rng.uniform(0, 1000)
        else:
            outbound, inbound = rng.uniform(40e6, 180e6), rng.uniform(100, 20000)
            duration, packets = rng.uniform(5000, 50000), outbound / 1400
        x.append(features(outbound, inbound, packets, duration, port))
        y.append(label)
    return np.asarray(x, dtype=np.float32), np.asarray(y)

def cic_csv(path):
    x, y = [], []
    with open(path, newline='', encoding='utf-8-sig') as stream:
        for raw in csv.DictReader(stream):
            row = {k.strip().lower().replace(' ', ''): v for k, v in raw.items() if k}
            try:
                label = row['label'].strip()
                y.append('benign' if label.lower() == 'benign' else label)
                x.append(features(float(row['totallengthoffwdpackets']), float(row['totallengthofbwdpackets']), float(row['totalfwdpackets']) + float(row['totalbackwardpackets']), float(row['flowduration']) / 1000, float(row['destinationport'])))
            except (KeyError, ValueError):
                if len(y) > len(x):
                    y.pop()
    if len(x) < 100:
        raise ValueError('At least 100 valid labeled CIC flow rows are required')
    return np.asarray(x, dtype=np.float32), np.asarray(y)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--csv', help='Labeled CIC-IDS2017 flow CSV; omit for synthetic benchmark')
    parser.add_argument('--dataset-name', default='CIC-IDS2017 local CSV')
    args = parser.parse_args()
    x, y = cic_csv(args.csv) if args.csv else synthetic()
    x_train, x_test, y_train, y_test = train_test_split(x, y, test_size=.25, stratify=y, random_state=73)
    forest = RandomForestClassifier(n_estimators=16, max_depth=5, min_samples_leaf=8, class_weight='balanced', random_state=42, n_jobs=1)
    forest.fit(x_train, y_train)
    predicted, probability = forest.predict(x_test), forest.predict_proba(x_test)
    classes = list(forest.classes_)
    benign = classes.index('benign')
    trees = []
    for estimator in forest.estimators_:
        tree = estimator.tree_
        nodes = []
        for i in range(tree.node_count):
            distribution = tree.value[i][0]
            nodes.append({'feature': int(tree.feature[i]), 'threshold': float(tree.threshold[i]), 'left': int(tree.children_left[i]), 'right': int(tree.children_right[i]), 'probability': (distribution / distribution.sum()).tolist()})
        trees.append(nodes)
    benchmark = 'real dataset' if args.csv else 'synthetic benchmark'
    model = {'version': 1, 'benchmark': benchmark, 'features': FEATURES, 'classes': classes, 'benign_index': benign, 'depth': 5, 'trees': trees, 'medians': np.median(x_train, axis=0).tolist(), 'importances': forest.feature_importances_.tolist(), 'threshold': .95}
    metrics = {'benchmark': benchmark, 'dataset': args.dataset_name if args.csv else 'Aegis synthetic flow generator v1', 'seed': 42, 'trained_at': datetime.now(timezone.utc).isoformat(), 'train_rows': len(x_train), 'test_rows': len(x_test), 'accuracy': accuracy_score(y_test, predicted), 'precision': precision_score(y_test, predicted, average='weighted', zero_division=0), 'recall': recall_score(y_test, predicted, average='weighted', zero_division=0), 'f1': f1_score(y_test, predicted, average='weighted', zero_division=0), 'roc_auc': roc_auc_score(y_test, probability, multi_class='ovr', average='weighted'), 'classes': classes, 'confusion_matrix': confusion_matrix(y_test, predicted, labels=classes).tolist(), 'classification_report': classification_report(y_test, predicted, output_dict=True, zero_division=0), 'limitations': ['Synthetic distributions are not representative of production networks', 'Flow features cannot identify every semantic attack', 'Random holdout does not prove cross-network generalization', 'Concept drift, class imbalance, dataset bias and false positives require external validation']}
    fixture = [{'features': row.tolist(), 'probability': proba.tolist()} for row, proba in zip(x_test[:64], probability[:64])]
    for file, data in [('content/model.json', model), ('content/metrics.json', metrics), ('ml/parity-fixture.json', fixture)]:
        (ROOT / file).parent.mkdir(parents=True, exist_ok=True)
        (ROOT / file).write_text(json.dumps(data, indent=2) + '\n')
    print(json.dumps(metrics, indent=2))

if __name__ == '__main__':
    main()
