import React, { useEffect, useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    ActivityIndicator,
    StatusBar,
    TouchableOpacity,
    Alert,
    TextInput,
    Modal,
    KeyboardAvoidingView,
    Platform,
    TouchableWithoutFeedback,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { WebView } from 'react-native-webview';
import axios from 'axios';
import OAuthManager from '../login/OAuthManager';
import { getBaseUrl } from '../utils/urlHelper';


// Full field set for a single equipment record (mirrors master_equipments inputFields)
const DETAIL_FIELDS =
    'Name;SerialNumber;EquipmentId;Description;CalibrationFrequency;CalibrationFrequencyUnit;' +
    'Make;Model;MakeYear;LeastCount;MeasureOfUncertainity;Manufacturer.Id;Manufacturer.Name;' +
    'CalibrationCertificateId;Type;CalibrationStatus;CalibrationDueDate;CalibrationGroup;' +
    'PreventiveFrequency;PreventiveFrequencyUnit;Range;Accuracy;Drift;ContractEndDate;' +
    'ContractStartDate;InstallDate;Compliance;Resolution;Supplier.Id;Supplier.Name;' +
    'LastCalibrationDate;EquipmentStatus;LastPreventiveDate;PreventiveDueDate;Location;' +
    'EquipmentType.Id;EquipmentType.Name;';

// Tabs match web: Calibration, Ranges, Uploads, Allocation. History is in Details.
const TABS = ['Details', 'Calibration', 'Ranges', 'Uploads', 'Allocation'];

const getMimeType = (ext) => {
    switch (ext) {
        case 'pdf': return 'application/pdf';
        case 'jpg': case 'jpeg': return 'image/jpeg';
        case 'png': return 'image/png';
        case 'gif': return 'image/gif';
        case 'webp': return 'image/webp';
        case 'doc': return 'application/msword';
        case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        case 'xls': return 'application/vnd.ms-excel';
        case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        default: return 'application/octet-stream';
    }
};

const formatDate = (value) => {
    if (!value) return '-';
    const d = new Date(value);
    if (isNaN(d.getTime())) return '-';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
};

const val = (v) => {
    if (v === null || v === undefined || v === '') return '-';
    return String(v);
};

const Row = ({ label, value }) => (
    <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{value}</Text>
    </View>
);

const Section = ({ title, children }) => (
    <View style={styles.section}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {children}
    </View>
);

// Generic record card for the related-data tabs
const RecordCard = ({ rows }) => (
    <View style={styles.recordCard}>
        {rows.map((r, i) => (
            <View style={styles.recordRow} key={i}>
                <Text style={styles.recordLabel}>{r.label}</Text>
                <Text style={styles.recordValue}>{r.value}</Text>
            </View>
        ))}
    </View>
);

const EmptyTab = ({ text, loading }) => (
    <View style={styles.tabEmpty}>
        {loading ? (
            <ActivityIndicator size="small" color="#3f4ff8" />
        ) : (
            <Text style={styles.emptyText}>{text}</Text>
        )}
    </View>
);

const MasterEquipmentDetailScreen = ({ route }) => {
    const { equipmentId, equipment: passedEquipment } = route.params || {};
    const id = equipmentId || passedEquipment?.id;

    const [equipment, setEquipment] = useState(passedEquipment || null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('Details');

    // Related records
    const [calibrations, setCalibrations] = useState([]);
    const [ranges, setRanges] = useState([]);
    const [allocation, setAllocation] = useState([]);
    const [documents, setDocuments] = useState([]);
    const [equipHistory, setEquipHistory] = useState([]);
    const [relatedLoading, setRelatedLoading] = useState(true);
    const [viewingPath, setViewingPath] = useState(null);
    const [viewerDoc, setViewerDoc] = useState(null);

    const [showHistoryForm, setShowHistoryForm] = useState(false);
    const [historyForm, setHistoryForm] = useState({
        dateTaken: '', dateReturned: '', locationFrom: '', sender: '',
        locationTo: '', receivedBy: '', purpose: '', refNumber: '',
    });
    const [activeDateField, setActiveDateField] = useState(null);
    const [savingHistory, setSavingHistory] = useState(false);

    const fetchAll = useCallback(async () => {
        if (!id) {
            setIsLoading(false);
            setRelatedLoading(false);
            return;
        }
        try {
            const accessToken = await OAuthManager.getAccessToken();
            if (!accessToken) throw new Error('Not authenticated');
            const instance = await OAuthManager.getInstance();
            if (!instance) throw new Error('Instance not found');
            const baseUrl = getBaseUrl(instance);
            const headers = { Authorization: `Bearer ${accessToken}` };

            // 1) Full equipment record
            try {
                const res = await axios.post(
                    `${baseUrl}/api/data/Equipment/list`,
                    { fields: DETAIL_FIELDS, conditions: [`Id = '${id}'`], logic: '{0}' },
                    { headers }
                );
                const list = Array.isArray(res.data) ? res.data : (res.data?.result || res.data?.data || []);
                if (list.length > 0) setEquipment(list[0]);
            } catch (err) {
                console.error('[EquipmentDetail] record error:', err.message);
            } finally {
                setIsLoading(false);
            }

            // 2) Related records in parallel — each guarded so one failure doesn't break others
            const safe = async (label, fn) => {
                try {
                    return await fn();
                } catch (err) {
                    console.error(`[EquipmentDetail] ${label} error:`, err.response?.status, err.config?.url, err.message);
                    return null;
                }
            };

            const toList = (data) =>
                Array.isArray(data) ? data : (data?.result || data?.data || []);

            const [cal, rng, alloc, docs, hist] = await Promise.all([
                safe('calibrations', async () => {
                    const r = await axios.post(
                        `${baseUrl}/api/data/Calibration/list`,
                        {
                            fields: 'CalibrationCompany.Id;CalibrationCompany.Name;CalibrationDate;CalibrationDueDate;Technician;CalibrationCertificateId;Remarks;Equipment.Id;',
                            conditions: [`Equipment.Id = '${id}'`],
                            logic: '{0}',
                        },
                        { headers }
                    );
                    return toList(r.data);
                }),
                safe('ranges', async () => {
                    const r = await axios.post(
                        `${baseUrl}/api/data/EquipmentRange/list`,
                        {
                            fields: 'RangeFrom;RangeTo;Accuracy;LeastCount;MeasureOfUncertainity;Equipment.Id;',
                            conditions: [`Equipment.Id = '${id}'`],
                            logic: '{0}',
                        },
                        { headers }
                    );
                    return toList(r.data);
                }),
                safe('allocation', async () => {
                    const r = await axios.post(
                        `${baseUrl}/api/data/EmployeeAsset/list`,
                        {
                            fields: 'Name;Condition;ProcessStatus;AllocationDate;ReturnDate;Equipment.Id;Equipment.Name;Employee.Id;Employee.Name;Employee.FirstName;Employee.LastName;',
                            conditions: [`Equipment.Id = '${id}'`],
                            logic: '{0}',
                        },
                        { headers }
                    );
                    return toList(r.data);
                }),
                safe('documents', async () => {
                    const prefix = encodeURIComponent(`standard_calibration_reports/${id}/`);
                    const s3ListUrl = `${baseUrl}/data/s3/list?prefix=${prefix}`;
                    const r = await axios.get(s3ListUrl, { headers });
                    const items = Array.isArray(r.data) ? r.data : (r.data?.items || r.data?.result || r.data?.data || []);
                    return items.map((item) => ({
                        key: item.key,
                        name: item.key.split('/').pop(),
                    }));
                }),
                safe('history', async () => {
                    const r = await axios.post(
                        `${baseUrl}/api/data/EquipmentLog/list`,
                        {
                            fields: 'EventDate;EventCompletionDate;UsedByName;Remarks;ReferenceNumber;Equipment.Id;Type;',
                            conditions: [`Equipment.Id = '${id}'`, `Type = 'Usage'`],
                            logic: '{0} AND {1}',
                        },
                        { headers }
                    );
                    return toList(r.data);
                }),
            ]);

            if (cal) setCalibrations(cal);
            if (rng) setRanges(rng);
            if (alloc) setAllocation(alloc);
            if (docs) setDocuments(docs);
            if (hist) setEquipHistory(hist);
        } catch (error) {
            console.error('[EquipmentDetail] fatal:', error.message);
        } finally {
            setIsLoading(false);
            setRelatedLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    const handleViewDocument = useCallback(async (doc) => {
        const s3Key = doc.key;
        if (!s3Key) {
            Alert.alert('Cannot Open', 'This document has no file key.');
            return;
        }
        try {
            setViewingPath(s3Key);
            const accessToken = await OAuthManager.getAccessToken();
            const instance = await OAuthManager.getInstance();
            const baseUrl = getBaseUrl(instance);

            const safeName = (doc.name || 'document').replace(/[^a-zA-Z0-9._-]/g, '_');
            const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
            const destination = `${baseDir}${safeName}`;
            try { await FileSystem.deleteAsync(destination, { idempotent: true }); } catch { }

            const downloadResult = await FileSystem.downloadAsync(
                `${baseUrl}/data/s3/download?key=${encodeURIComponent(s3Key)}`,
                destination,
                { headers: { Authorization: `Bearer ${accessToken}` } }
            );

            if (downloadResult.status !== 200) throw new Error(`Download failed: ${downloadResult.status}`);

            const ext = safeName.split('.').pop().toLowerCase();
            const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext);

            // Android WebView can't render PDFs natively — open directly in device viewer via ACTION_VIEW
            if (Platform.OS === 'android' && !isImage) {
                const contentUri = await FileSystem.getContentUriAsync(downloadResult.uri);
                await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
                    data: contentUri,
                    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
                    type: getMimeType(ext),
                });
            } else {
                setViewerDoc({ uri: downloadResult.uri, name: doc.name || 'Document' });
            }
        } catch (error) {
            console.error('[EquipmentDetail] view document error:', error.message);
            Alert.alert('Error', 'Could not open this document.');
        } finally {
            setViewingPath(null);
        }
    }, []);



    const ddmmToISO = (str) => {
        if (!str) return null;
        const [d, m, y] = str.split('/');
        if (!d || !m || !y) return null;
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    };

    const handleSaveHistory = useCallback(async () => {
        const { dateTaken, locationFrom, sender, locationTo, receivedBy } = historyForm;
        if (!dateTaken || !locationFrom || !sender || !locationTo || !receivedBy) {
            Alert.alert('Required', 'Fill in Date Taken, Location (From), Sender, Location (To), and Received By.');
            return;
        }
        try {
            setSavingHistory(true);
            const accessToken = await OAuthManager.getAccessToken();
            const instance = await OAuthManager.getInstance();
            const baseUrl = getBaseUrl(instance);
            const remarks = `From: ${locationFrom} | Location: ${locationTo} | Sender: ${sender}${historyForm.purpose ? ' | ' + historyForm.purpose : ''}`;
            await axios.post(
                `${baseUrl}/api/data/EquipmentLog/create`,
                {
                    eventDate: ddmmToISO(dateTaken),
                    eventCompletionDate: ddmmToISO(historyForm.dateReturned),
                    equipment: { id: Number(id) },
                    name: locationFrom,
                    usedByName: receivedBy,
                    remarks,
                    referenceNumber: historyForm.refNumber || null,
                    type: 'Usage',
                },
                { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            setHistoryForm({ dateTaken: '', dateReturned: '', locationFrom: '', sender: '', locationTo: '', receivedBy: '', purpose: '', refNumber: '' });
            setShowHistoryForm(false);
            await fetchAll();
        } catch (err) {
            console.error('[EquipmentDetail] save history error:', err.message);
            Alert.alert('Error', 'Could not save history entry.');
        } finally {
            setSavingHistory(false);
        }
    }, [historyForm, id, fetchAll]);

    if (isLoading && !equipment) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#3f4ff8" />
            </View>
        );
    }

    if (!equipment) {
        return (
            <View style={styles.loadingContainer}>
                <Text style={styles.emptyText}>Equipment not found.</Text>
            </View>
        );
    }

    const e = equipment;

    const renderDetails = () => (
        <>
            <Section title="Basic Information">
                <Row label="Name" value={val(e.name)} />
                <Row label="Equipment Type" value={val(e.equipmentType?.name)} />
                <Row label="Serial Number" value={val(e.serialNumber)} />
                <Row label="Equipment ID" value={val(e.equipmentId)} />
            </Section>

            <Section title="Manufacturer & Supplier Details">
                <Row label="Manufacturer" value={val(e.manufacturer?.name)} />
                <Row label="Supplier" value={val(e.supplier?.name)} />
                <Row label="Make" value={val(e.make)} />
                <Row label="Model" value={val(e.model)} />
                <Row label="Year Of Manufacture" value={val(e.makeYear)} />
            </Section>

            <Section title="Technical Specifications">
                <Row label="Range" value={val(e.range)} />
                <Row label="Accuracy" value={val(e.accuracy)} />
                <Row label="Resolution" value={val(e.resolution)} />
                <Row label="Drift" value={val(e.drift)} />
            </Section>

            <Section title="Calibration & Maintenance">
                <Row
                    label="Calibration Frequency"
                    value={`${val(e.calibrationFrequency)} ${e.calibrationFrequencyUnit || ''}`.trim()}
                />
                <Row
                    label="Preventive Frequency"
                    value={`${val(e.preventiveFrequency)} ${e.preventiveFrequencyUnit || ''}`.trim()}
                />
                <Row label="GLP / Non GLP" value={val(e.compliance)} />
                <Row label="Location" value={val(e.location)} />
            </Section>

            <Section title="Installation & Contract Details">
                <Row label="Installation Date" value={formatDate(e.installDate)} />
                <Row label="Contract / AMC Start" value={formatDate(e.contractStartDate)} />
                <Row label="Contract / AMC End" value={formatDate(e.contractEndDate)} />
            </Section>

            <Section title="Calibration Status">
                <Text style={styles.calStatusValue}>{val(e.calibrationStatus)}</Text>
            </Section>

            {renderHistorySection()}
        </>
    );

    const renderCalibration = () =>
        calibrations.length === 0 ? (
            <EmptyTab text="No calibration records." loading={relatedLoading} />
        ) : (
            calibrations.map((c, i) => (
                <RecordCard
                    key={i}
                    rows={[
                        { label: 'Company', value: val(c.calibrationCompany?.name) },
                        { label: 'Calibration Date', value: formatDate(c.calibrationDate) },
                        { label: 'Due Date', value: formatDate(c.calibrationDueDate) },
                        { label: 'Technician', value: val(c.technician) },
                        { label: 'Certificate No.', value: val(c.calibrationCertificateId) },
                        { label: 'Remark', value: val(c.remarks) },
                    ]}
                />
            ))
        );

    const renderRanges = () =>
        ranges.length === 0 ? (
            <EmptyTab text="No ranges." loading={relatedLoading} />
        ) : (
            ranges.map((r, i) => (
                <RecordCard
                    key={i}
                    rows={[
                        { label: 'Range Start', value: val(r.rangeFrom) },
                        { label: 'Range End', value: val(r.rangeTo) },
                        { label: 'Accuracy', value: val(r.accuracy) },
                        { label: 'Least Count', value: val(r.leastCount) },
                        { label: 'Uncertainty', value: val(r.measureOfUncertainity) },
                    ]}
                />
            ))
        );

    // const renderParts = (list, emptyText) => { ... };  // Integral/Spare Parts tabs removed

    const renderAllocation = () =>
        allocation.length === 0 ? (
            <EmptyTab text="No allocation records." loading={relatedLoading} />
        ) : (
            allocation.map((a, i) => (
                <RecordCard
                    key={i}
                    rows={[
                        { label: 'Asset', value: val(a.equipment?.name || a.name) },
                        { label: 'Employee', value: val([a.employee?.firstName, a.employee?.lastName].filter(Boolean).join(' ') || a.employee?.name) },
                        { label: 'Allocation Date', value: formatDate(a.allocationDate) },
                        { label: 'Return Date', value: formatDate(a.returnDate) },
                        { label: 'Status', value: val(a.processStatus) },
                        { label: 'Condition', value: val(a.condition) },
                    ]}
                />
            ))
        );

    const renderUploads = () => (
        <>
            {documents.length === 0 ? (
                <EmptyTab text="No uploads." loading={relatedLoading} />
            ) : (
                documents.map((d, i) => (
                    <View style={styles.recordCard} key={i}>
                        <View style={styles.recordRow}>
                            <Text style={styles.recordLabel}>Name</Text>
                            <Text style={styles.recordValue}>{val(d.name)}</Text>
                        </View>
                        <View style={styles.uploadBtnRow}>
                            <TouchableOpacity
                                style={[styles.viewBtn, { flex: 1 }]}
                                onPress={() => handleViewDocument(d)}
                                disabled={viewingPath === d.key}
                            >
                                {viewingPath === d.key
                                    ? <ActivityIndicator size="small" color="#fff" />
                                    : <Text style={styles.viewBtnText}>View</Text>
                                }
                            </TouchableOpacity>
                        </View>
                    </View>
                ))
            )}
        </>
    );

    const parseHistoryRemarks = (remarks) => {
        if (!remarks) return { from: '-', to: '-', sender: '-', purpose: '-' };
        const result = { from: '-', to: '-', sender: '-', purpose: '' };
        remarks.split(' | ').forEach((seg) => {
            if (seg.startsWith('From: ')) result.from = seg.substring(6);
            else if (seg.startsWith('Location: ')) result.to = seg.substring(10);
            else if (seg.startsWith('Sender: ')) result.sender = seg.substring(8);
            else result.purpose = result.purpose ? `${result.purpose} | ${seg}` : seg;
        });
        return result;
    };

    const historyDateToObj = (str) => {
        if (!str) return new Date();
        const [d, m, y] = str.split('/');
        const parsed = new Date(Number(y), Number(m) - 1, Number(d));
        return isNaN(parsed.getTime()) ? new Date() : parsed;
    };

    const onDateChange = (event, selectedDate) => {
        const field = activeDateField;
        setActiveDateField(null);
        if (event.type === 'dismissed' || !selectedDate || !field) return;
        const day = String(selectedDate.getDate()).padStart(2, '0');
        const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
        const year = selectedDate.getFullYear();
        setHistoryForm((f) => ({ ...f, [field]: `${day}/${month}/${year}` }));
    };

    const renderHistorySection = () => (
        <Section title="Equipment History">
            <TouchableOpacity
                style={styles.addHistoryBtn}
                onPress={() => setShowHistoryForm(true)}
            >
                <Text style={styles.addHistoryBtnText}>+ Add Usage Log</Text>
            </TouchableOpacity>

            <Modal
                visible={showHistoryForm}
                transparent
                animationType="slide"
                onRequestClose={() => setShowHistoryForm(false)}
            >
                <TouchableWithoutFeedback onPress={() => setShowHistoryForm(false)}>
                    <View style={styles.modalBackdrop}>
                        <KeyboardAvoidingView
                            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                            style={styles.modalKeyboardView}
                        >
                            <TouchableWithoutFeedback onPress={() => {}}>
                                <View style={styles.historyFormContainer}>
                                    <Text style={styles.modalTitle}>Add Usage Log</Text>
                                    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                                        {[
                                            { key: 'dateTaken', label: 'Date Taken *', isDate: true },
                                            { key: 'dateReturned', label: 'Date Returned', isDate: true },
                                            { key: 'locationFrom', label: 'Location (From) *', placeholder: 'From location' },
                                            { key: 'sender', label: 'Sender *', placeholder: 'Sender name' },
                                            { key: 'locationTo', label: 'Location (To) *', placeholder: 'To location' },
                                            { key: 'receivedBy', label: 'Received By *', placeholder: 'Receiver name' },
                                            { key: 'purpose', label: 'Purpose / Remarks', placeholder: 'Optional' },
                                            { key: 'refNumber', label: 'Reference Number', placeholder: 'Optional' },
                                        ].map(({ key, label, placeholder, isDate }) => (
                                            <View key={key} style={styles.historyField}>
                                                <Text style={styles.historyFieldLabel}>{label}</Text>
                                                {isDate ? (
                                                    <TouchableOpacity
                                                        style={[styles.historyFieldInput, styles.historyDateField]}
                                                        onPress={() => setActiveDateField(key)}
                                                    >
                                                        <Text style={historyForm[key] ? styles.historyDateText : styles.historyDatePlaceholder}>
                                                            {historyForm[key] || 'DD/MM/YYYY'}
                                                        </Text>
                                                        <Text style={styles.historyDateIcon}>📅</Text>
                                                    </TouchableOpacity>
                                                ) : (
                                                    <TextInput
                                                        style={styles.historyFieldInput}
                                                        placeholder={placeholder}
                                                        placeholderTextColor="#aaa"
                                                        value={historyForm[key]}
                                                        onChangeText={(t) => setHistoryForm((f) => ({ ...f, [key]: t }))}
                                                    />
                                                )}
                                            </View>
                                        ))}
                                        <View style={styles.historyFormButtons}>
                                            <TouchableOpacity
                                                style={[styles.addHistoryBtn, styles.historyBtnCancel]}
                                                onPress={() => setShowHistoryForm(false)}
                                            >
                                                <Text style={styles.addHistoryBtnText}>Cancel</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[styles.addHistoryBtn, styles.historyBtnSave, savingHistory && { opacity: 0.6 }]}
                                                onPress={handleSaveHistory}
                                                disabled={savingHistory}
                                            >
                                                {savingHistory
                                                    ? <ActivityIndicator size="small" color="#fff" />
                                                    : <Text style={styles.addHistoryBtnText}>Save</Text>
                                                }
                                            </TouchableOpacity>
                                        </View>
                                    </ScrollView>
                                </View>
                            </TouchableWithoutFeedback>
                        </KeyboardAvoidingView>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>

            {activeDateField !== null && (
                <DateTimePicker
                    value={historyDateToObj(historyForm[activeDateField])}
                    mode="date"
                    display="default"
                    onChange={onDateChange}
                />
            )}

            {relatedLoading && equipHistory.length === 0 ? (
                <ActivityIndicator size="small" color="#3f4ff8" style={{ marginTop: 8 }} />
            ) : equipHistory.length === 0 ? (
                <Text style={styles.emptyText}>No usage history.</Text>
            ) : (
                equipHistory.map((h, i) => {
                    const { from, to, sender, purpose } = parseHistoryRemarks(h.remarks);
                    return (
                        <RecordCard
                            key={i}
                            rows={[
                                { label: 'Date Taken', value: formatDate(h.eventDate) },
                                { label: 'Date Returned', value: formatDate(h.eventCompletionDate) },
                                { label: 'Location (From)', value: val(h.name || from) },
                                { label: 'Sender', value: val(sender) },
                                { label: 'Location (To)', value: val(to) },
                                { label: 'Received By', value: val(h.usedByName) },
                                { label: 'Purpose', value: val(purpose) },
                                { label: 'Reference No.', value: val(h.referenceNumber) },
                            ]}
                        />
                    );
                })
            )}
        </Section>
    );

    const renderTab = () => {
        switch (activeTab) {
            case 'Details': return renderDetails();
            case 'Calibration': return renderCalibration();
            case 'Ranges': return renderRanges();
            case 'Uploads': return renderUploads();
            case 'Allocation': return renderAllocation();
            default: return null;
        }
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar barStyle="dark-content" backgroundColor="#fff" />
            <View style={styles.header}>
                <Text style={styles.title}>{e.name || 'Equipment'}</Text>
                <Text style={styles.subtitle}>
                    {(e.equipmentId || '-') + (e.location ? `  •  ${e.location}` : '')}
                </Text>
            </View>

            <View style={styles.tabBar}>
                {TABS.map((tab) => (
                    <TouchableOpacity
                        key={tab}
                        style={[styles.tab, activeTab === tab && styles.tabActive]}
                        onPress={() => setActiveTab(tab)}
                    >
                        <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                            {tab}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 24 }}>
                {renderTab()}
            </ScrollView>

            <Modal
                visible={!!viewerDoc}
                animationType="slide"
                onRequestClose={() => setViewerDoc(null)}
            >
                <SafeAreaView style={styles.viewerSafeArea}>
                    <View style={styles.viewerHeader}>
                        <Text style={styles.viewerTitle} numberOfLines={1}>{viewerDoc?.name}</Text>
                        <TouchableOpacity onPress={() => setViewerDoc(null)} style={styles.viewerCloseBtn}>
                            <Text style={styles.viewerCloseText}>✕</Text>
                        </TouchableOpacity>
                    </View>
                    {viewerDoc && (
                        <WebView
                            source={{ uri: viewerDoc.uri }}
                            style={{ flex: 1 }}
                            originWhitelist={['*']}
                            allowFileAccess
                            allowUniversalAccessFromFileURLs
                        />
                    )}
                </SafeAreaView>
            </Modal>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#fff' },
    container: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#fff',
    },
    emptyText: { fontSize: 16, color: '#888' },
    header: {
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    title: { fontSize: 20, fontWeight: 'bold', color: '#3f4ff8' },
    subtitle: { fontSize: 14, color: '#666', marginTop: 4 },
    tabBar: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: 6,
        paddingTop: 6,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        backgroundColor: '#fafafa',
    },
    tab: {
        paddingVertical: 8,
        paddingHorizontal: 10,
        marginRight: 6,
        marginBottom: 6,
        borderRadius: 16,
        backgroundColor: '#eee',
    },
    tabActive: { backgroundColor: '#3f4ff8' },
    tabText: { fontSize: 13, color: '#666', fontWeight: '500' },
    tabTextActive: { color: '#fff', fontWeight: 'bold' },
    section: { marginBottom: 18 },
    sectionTitle: {
        fontSize: 15,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 8,
        backgroundColor: '#f0f0f0',
        padding: 8,
        borderRadius: 6,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 8,
        paddingHorizontal: 4,
        borderBottomWidth: 1,
        borderBottomColor: '#f2f2f2',
    },
    label: { flex: 1, fontSize: 14, color: '#666' },
    value: { flex: 1, fontSize: 14, color: '#222', textAlign: 'right', fontWeight: '500' },
    recordCard: {
        borderWidth: 1,
        borderColor: '#e8e8e8',
        borderRadius: 8,
        padding: 12,
        marginBottom: 10,
        backgroundColor: '#fcfcfc',
    },
    recordRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 5,
        borderBottomWidth: 1,
        borderBottomColor: '#f4f4f4',
    },
    recordLabel: { flex: 1, fontSize: 13, color: '#777' },
    recordValue: { flex: 1.3, fontSize: 13, color: '#222', textAlign: 'right', fontWeight: '500' },
    tabEmpty: { paddingTop: 40, alignItems: 'center' },
    viewBtn: {
        marginTop: 10,
        backgroundColor: '#3f4ff8',
        paddingVertical: 9,
        borderRadius: 6,
        alignItems: 'center',
    },
    viewBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
    uploadBtnRow: { flexDirection: 'row', marginTop: 10 },

    // Calibration status (read-only display)
    calStatusValue: { fontSize: 14, color: '#222', fontWeight: '500', paddingVertical: 4 },

    // Equipment history form
    addHistoryBtn: {
        backgroundColor: '#3f4ff8',
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 6,
        alignSelf: 'flex-start',
        marginBottom: 10,
    },
    addHistoryBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
    // Modal backdrop + sheet
    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.45)',
        justifyContent: 'flex-end',
    },
    modalKeyboardView: {
        width: '100%',
        justifyContent: 'flex-end',
    },
    historyFormContainer: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        padding: 16,
        maxHeight: '90%',
    },
    modalTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 14,
    },
    historyField: { marginBottom: 10 },
    historyFieldLabel: { fontSize: 12, color: '#666', marginBottom: 3 },
    historyFieldInput: {
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 6,
        paddingHorizontal: 10,
        paddingVertical: 7,
        fontSize: 14,
        color: '#222',
        backgroundColor: '#fff',
    },
    historyDateField: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    historyDateText: { fontSize: 14, color: '#222' },
    historyDatePlaceholder: { fontSize: 14, color: '#aaa' },
    historyDateIcon: { fontSize: 16 },
    historyFormButtons: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 6,
        marginBottom: 4,
    },
    historyBtnCancel: { flex: 1, alignSelf: 'auto', backgroundColor: '#888' },
    historyBtnSave: { flex: 1, alignSelf: 'auto' },

    // Document viewer
    viewerSafeArea: { flex: 1, backgroundColor: '#000' },
    viewerHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1a1a1a',
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    viewerTitle: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '600' },
    viewerCloseBtn: { paddingHorizontal: 8, paddingVertical: 4 },
    viewerCloseText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});

export default MasterEquipmentDetailScreen;
