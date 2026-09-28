import {
  MdDashboard, MdReceipt, MdPeople, MdAdminPanelSettings, MdEmojiTransportation,
  MdEdit, MdInventory2, MdClass, MdAccountBox, MdCategory, MdStraighten, MdDomain,
  MdInventory, MdBadge, MdShoppingCart, MdLocationOn, MdLocalShipping, MdCompareArrows,
  MdFormatListBulleted, MdAccountTree, MdReceiptLong, MdAccountBalance, MdLaptop,
  MdLaptopChromebook, MdMan, MdRequestPage, MdOutlineRequestPage, MdPageview,
  MdSpaceDashboard, MdOutlineLaptop, MdTexture, MdPayment, MdAssignmentReturn,
  MdAssessment, MdDashboardCustomize, MdTrendingUp, MdBarChart, MdAccountBalanceWallet,
  MdBalance, MdPauseCircleFilled, MdInbox, MdPointOfSale, MdWarehouse
} from 'react-icons/md';
import HoldingReport from '../pages/Reports/Holding Report/HoldingReport';
import HoldingReportPrint from '../pages/Reports/Holding Report/HoldingReportPrint';
import Brands from '../pages/Administration/Brands';
import Dashboard from '../pages/Dashboard/Dashboard';
import SalesmanDashboard from '../pages/Dashboard/SalesmanDashboard';
import WarehouseDashboard from '../pages/Dashboard/WarehouseDashboard';
import NewInvoice from '../pages/Sales/Invoice/NewInvoice';
import SalesHistory from '../pages/Sales/Invoice/SalesHistory';
import PrintInvoice from '../pages/Sales/Invoice/PrintInvoice';
import AddCustomer from '../pages/Sales/Customers/AddCustomer';
import CustomerHistory from '../pages/Sales/Customers/CustomerHistory';
import AddSalesman from '../pages/Sales/Salesman/AddSalesman';
import SalesmanHistory from '../pages/Sales/Salesman/SalesmanHistory';
import AddCompany from '../pages/Administration/AddCompany';
import DeliveryChallanHistory from '../pages/Sales/Delivery Challan/DeliveryChallanHistory';
import ShopDispatchQueue from '../pages/Sales/Delivery Challan/ShopDispatchQueue';
import AddDeliveryChallan from '../pages/Sales/Delivery Challan/AddDeliveryChallan';
import PrintChallan from '../pages/Sales/Delivery Challan/PrintChallan';
import SalesReturnList from '../pages/Sales/Sales Return/SalesReturnList';
import AddSalesReturn from '../pages/Sales/Sales Return/AddSalesReturn';
import PrintSalesReturn from '../pages/Sales/Sales Return/PrintSalesReturn';
import ProductList from '../pages/Administration/Products/ProductList';
import AddProduct from '../pages/Administration/Products/AddProduct';
import BulkProductUpload from '../pages/Administration/Products/BulkProductUpload';
import Categories from '../pages/Administration/Categories';
import UomManager from '../pages/Administration/UomManager';
import SurfaceFinish from '../pages/Administration/SurfaceFinish';
import LocationList from '../pages/Administration/Location/LocationList';
import AddLocation from '../pages/Administration/Location/AddLocation';
import TransportationList from '../pages/Administration/Transportation/TransportationList';
import AddTransportation from '../pages/Administration/Transportation/AddTransportation';
import StockTransferList from '../pages/Administration/Stock Transfer/StockTransferList';
import AddStockTransfer from '../pages/Administration/Stock Transfer/AddStockTransfer';
import ChartOfAccountList from '../pages/Registration/Chart of Account/ChartOfAccountList';
import AddChartOfAccount from '../pages/Registration/Chart of Account/AddChartOfAccount';
import VoucherList from '../pages/Registration/Vouchers/VoucherList';
import AddVoucher from '../pages/Registration/Vouchers/AddVoucher';
import BankAccountList from '../pages/Registration/Bank Account/BankAccountList';
import AddBank from '../pages/Registration/Bank Account/AddBankAccount';
import AddOpeningStock from '../pages/Registration/Opening Stock/AddOpeningStock';
import OpeningStockList from '../pages/Registration/Opening Stock/OpeningStockList';
import { Children, Component } from 'react';
import AddInvoiceReceipt from '../pages/Registration/Invoice Receipt/AddInvoiceReceipt';
import InvoiceReceiptList from '../pages/Registration/Invoice Receipt/InvoiceReceiptList';
import PrintInvoiceReceipt from '../pages/Registration/Invoice Receipt/PrintInvoiceReceipt';
import AddMultiInvoiceReceipt from '../pages/Registration/Multi Invoice Receipt/AddMultiInvoiceReceipt';
import AddPurchases from '../pages/Purchase/Purchase/AddPurchases';
import PurchaseList from '../pages/Purchase/Purchase/PurchaseList';
import PrintPurchase from '../pages/Purchase/Purchase/PrintPurchase';
import GRNList from '../pages/Purchase/GRN/GRNList';
import AddGRN from '../pages/Purchase/GRN/AddGRN';
import InwardChallanList from '../pages/Purchase/Inward Challan/InwardChallanList';
import VerifyInward from '../pages/Purchase/Inward Challan/VerifyInward';
import ReturnChallanList from '../pages/Warehouse/Return Challan/ReturnChallanList';
import VerifyReturnChallan from '../pages/Warehouse/Return Challan/VerifyReturnChallan';
import VendorList from '../pages/Purchase/Vendor/VendorList';
import AddVendor from '../pages/Purchase/Vendor/AddVendor';
import PurchaseReceiptList from '../pages/Purchase/Purchase Receipt/PurchaseReceiptList';
import AddPurchaseReceipt from '../pages/Purchase/Purchase Receipt/AddPurchaseReceipt';
import PrintPurchaseReceipt from '../pages/Purchase/Purchase Receipt/PrintPurchaseReceipt';
import PurchaseReturnList from '../pages/Purchase/Purchase Return/PurchaseReturnList';
import AddPurchaseReturn from '../pages/Purchase/Purchase Return/AddPurchaseReturn';
import PrintPurchaseReturn from '../pages/Purchase/Purchase Return/PrintPurchaseReturn';
import PurchaseReturnReceiptList from '../pages/Purchase/Purchase Return Receipt/PurchaseReturnReceiptList';
import AddPurchaseReturnReceipt from '../pages/Purchase/Purchase Return Receipt/AddPurchaseReturnReceipt';
import PrintPurchaseReturnReceipt from '../pages/Purchase/Purchase Return Receipt/PrintPurchaseReturnReceipt';
import ReportDashboard from '../pages/Reports/ReportDashboard';
import SalesReport from '../pages/Reports/Sales Report/SalesReport';
import PurchaseReport from '../pages/Reports/Purchase Report/PurchaseReports';
import StockReport from '../pages/Reports/Stock Report/StockReport';
import AccountReport from '../pages/Reports/Account Report/AccountReport';
import SaleReportPrint from '../pages/Reports/Sales Report/SaleReportPrint';
import SaleReturnReceiptList from '../pages/Sales/Sales Return Receipt/SaleReturnReceiptList';
import SaleReturnReceiptAdd from '../pages/Sales/Sales Return Receipt/SalesReturnReceiptAdd';
import PrintSalesReturnReceipt from '../pages/Sales/Sales Return Receipt/PrintSalesReturnReceipt';
import PurchaseReportPrint from '../pages/Reports/Purchase Report/PurchaseReportPrint';
import StockReportPrint from '../pages/Reports/Stock Report/StockReportPrint';
import AccountReportPrint from '../pages/Reports/Account Report/AccountReportPrint';
import BalanceSheet from '../pages/Reports/BalanceSheet';
import DedicatedReportFilter from '../pages/Reports/DedicatedReportFilter';

export const adminRoutes = [
  {
    path: '/',
    component: <Dashboard />,
    label: 'Dashboard',
    icon: MdDashboard,
  },
  {
    path: '/Dashboard/Salesman',
    component: <SalesmanDashboard />,
    label: 'Salesman Dashboard',
    icon: MdPointOfSale,
    hideFromSidebar: true,
  },
  {
    path: '/Dashboard/Warehouse',
    component: <WarehouseDashboard />,
    label: 'Warehouse Dashboard',
    icon: MdWarehouse,
    hideFromSidebar: true,
  },
  {
    label: 'Administation',
    icon: MdAdminPanelSettings,
    children: [
      {
        path: '/Administration/Categories/List',
        component: <Categories />,
        label: 'Categories',
        icon: MdCategory
      },
      {
        path: '/Administration/Surface-Finish',
        component: <SurfaceFinish />,
        label: 'Brand',
        icon: MdTexture
      },
      {
        path: '/Administration/UOM/List',
        component: <UomManager />,
        label: 'UOMs',
        icon: MdStraighten
      },
      /*
      {
        path: '/Administration/Brands',
        component: <Brands />,
        label: 'Brands',
        icon: MdDomain
      },
      */
      {
        label: 'Products',
        icon: MdDashboard,
        path: '/Administration/Products/List',
        component: <ProductList />,
      },
      {
        label: 'Bulk Upload',
        icon: MdDashboard,
        path: '/Administration/Products/Bulk-Upload',
        component: <BulkProductUpload />,
      },
      {
        path: '/Administration/Locations/List',
        component: <LocationList />,
        label: 'Locations',
        icon: MdLocationOn
      },
      {
        path: '/Administration/Transportation/List',
        component: <TransportationList />,
        label: 'Transportation',
        icon: MdLocalShipping
      },
      {
        path: '/Administration/StockTransfer/List',
        component: <StockTransferList />,
        label: 'Stock Transfer',
        icon: MdCompareArrows
      }
      /* 
      {
        path: '/company',
        component: <AddCompany />,
        label: 'Company',
        icon: MdAccountBox
      }
      */
    ]
  },
  {
    label: 'REGISTRATION',
    icon: MdFormatListBulleted,
    children: [
      {
        path: '/Registration/Chart-of-Account/List',
        component: <ChartOfAccountList />,
        label: 'Chart Of Account',
        icon: MdAccountTree
      },
      {
        path: '/Registration/Vouchers/List',
        component: <VoucherList />,
        label: 'Vouchers',
        icon: MdReceiptLong
      },
      {
        path: '/Registration/Bank-Account/BankAccountList',
        component: <BankAccountList />,
        label: 'Bank Account',
        icon: MdAccountBalance
      },
      {
        path: '/Inventory/OpeningStock/List',
        component: <OpeningStockList />,
        label: 'Opening Stock',
        icon: MdInventory
      },
    ]
  },
  {
    label: 'Sales',
    icon: MdReceipt,
    children: [
      {
        label: 'Invoice',
        icon: MdReceipt,
        path: '/Sales/Invoice/List',
        component: <SalesHistory />
      },
      {
        path: '/Sales/InvoiceReceipt/List',
        component: <InvoiceReceiptList />,
        label: 'Invoice Receipt',
        icon: MdReceipt
      },
      {
        label: 'Sales Return',
        icon: MdEdit,
        path: '/Sales/Sales-Return/List',
        component: <SalesReturnList />,
      },
      {
        label: 'Sales Return Receipt',
        icon: MdEdit,
        path: '/Sales/Sales-Return-Receipt/List',
        component: <SaleReturnReceiptList />
      },
      {
        label: 'Customers',
        path: '/Sales/Customers/List',
        component: <CustomerHistory />,
        icon: MdPeople,
      },
      {
        label: 'Salesman',
        path: '/Sales/Salesman/List',
        component: <SalesmanHistory />,
        icon: MdPeople,
      },
      {
        label: 'Delivery Challan',
        path: '/Sales/Delivery-Challan/List',
        component: <DeliveryChallanHistory />,
        icon: MdEmojiTransportation,
      },
      {
        label: 'Shop Dispatch Queue (SDQ)',
        path: '/Sales/Shop-Dispatch/List',
        component: <ShopDispatchQueue />,
        icon: MdEmojiTransportation,
      },
      {
        label: 'Return Challan',
        path: '/Warehouse/Return-Challan',
        component: <ReturnChallanList locationFilter="WAREHOUSE" />,
        icon: MdAssignmentReturn
      },
      {
        label: 'Shop Return Queue',
        path: '/Warehouse/Shop-Return',
        component: <ReturnChallanList locationFilter="SHOP" />,
        icon: MdAssignmentReturn
      }
    ],
  },
  {
    label: 'Purchase',
    icon: MdLaptop,
    children: [
      {
        label: 'Purchases',
        path: '/Purchase/Purchases/List',
        component: <PurchaseList />,
        icon: MdLaptopChromebook
      },

      {
        label: 'Inward Challan (Warehouse)',
        path: '/Purchase/Inward-Challan/List',
        component: <InwardChallanList locationFilter="WAREHOUSE" />,
        icon: MdInbox
      },
      {
        label: 'Shop Receiving Queue',
        path: '/Purchase/Shop-Receiving',
        component: <InwardChallanList locationFilter="SHOP" />,
        icon: MdInbox
      },

      {
        label: 'Purchase Receipt',
        path: '/Purchase/Purchase-Receipt/List',
        component: <PurchaseReceiptList />,
        icon: MdPayment
      },
      {
        label: 'Purchase Return',
        path: '/Purchase/Purchase-Return/List',
        component: <PurchaseReturnList />,
        icon: MdAssignmentReturn
      },
      {
        label: 'Purchase Return Receipt',
        path: '/Purchase/Purchase-Return-Receipt/List',
        component: <PurchaseReturnReceiptList />,
        icon: MdReceiptLong
      },
      {
        label: 'Vendor',
        path: '/Purchase/Vendor/List',
        component: <VendorList />,
        icon: MdPeople
      }

    ]
  },
  {
    label: 'Reports',
    path: '/Reports/Reports-Dashboard',
    component: <ReportDashboard />,
    icon: MdAssessment
  },
  {
    path: '/Reports/Sales-Report',
    component: <SalesReport />,
    label: 'Sales Report',
    hideFromSidebar: true
  },
  {
    path: '/Reports/Purchase-Report',
    component: <PurchaseReport />,
    label: 'Purchase Report',
    hideFromSidebar: true
  },
  {
    path: '/Reports/Stock-Report',
    component: <StockReport />,
    label: 'Stock Report',
    hideFromSidebar: true
  },
  {
    path: '/Reports/Account-Report',
    component: <AccountReport />,
    label: 'Account Report',
    hideFromSidebar: true
  },
  {
    path: '/Reports/Holding-Report',
    component: <HoldingReport />,
    label: 'Holding Item Report',
    hideFromSidebar: true
  },
  {
    path: '/Reports/Balance-Sheet',
    component: <BalanceSheet />,
    label: 'Balance Sheet',
    hideFromSidebar: true
  },
  {
    path: '/Reports/view/:reportId',
    component: <DedicatedReportFilter />,
    label: 'Report Filter',
    hideFromSidebar: true
  },
  {
    path: '/Administration/Products/Add',
    component: <AddProduct />,
    label: 'Add Product',
    hideFromSidebar: true
  },
  {
    path: '/Administration/Locations/Add',
    component: <AddLocation />,
    label: 'Add Location',
    hideFromSidebar: true
  },
  {
    path: '/Administration/Transportation/Add',
    component: <AddTransportation />,
    label: 'Add Transportation',
    hideFromSidebar: true
  },
  {
    path: '/Administration/StockTransfer/Add',
    component: <AddStockTransfer />,
    label: 'Add Stock Transfer',
    hideFromSidebar: true
  },
  {
    path: '/Registration/Chart-of-Account/Add',
    component: <AddChartOfAccount />,
    label: 'Add Account',
    hideFromSidebar: true
  },
  {
    path: '/Registration/Vouchers/Add',
    component: <AddVoucher />,
    label: 'Add Voucher',
    hideFromSidebar: true
  },
  {
    path: '/Delivery-Challan/Print/:id',
    component: <PrintChallan />,
    label: 'Print Challan',
    hideFromSidebar: true
  },
  {
    path: '/Sales/Delivery-Challan/Print/:id',
    component: <PrintChallan />,
    label: 'Print Challan',
    hideFromSidebar: true
  },
  {
    path: '/Sales-Return/Debit-Notes/Print/:id',
    component: <PrintSalesReturn />,
    label: 'Print Voucher',
    hideFromSidebar: true
  },
  {
    path: '/Sales/Sales-Return/Print/:id',
    component: <PrintSalesReturn />,
    label: 'Print Voucher',
    hideFromSidebar: true
  },
  {
    path: '/sales/invoice/print/:id',
    component: <PrintInvoice />,
    label: 'Print Invoice',
    hideFromSidebar: true
  },
  {
    path: '/Sales/Invoice/Print/:id',
    component: <PrintInvoice />,
    label: 'Print Invoice',
    hideFromSidebar: true
  },
  {
    path: '/Registration/Bank-Account/AddBank',
    component: <AddBank />,
    hideFromSidebar: true
  },
  {
    path: '/Inventory/OpeningStock/Add',
    component: <AddOpeningStock />,
    label: 'Add Opening Stock',
    hideFromSidebar: true
  },
  {
    path: '/sales/invoice/add',
    component: <NewInvoice />,
    label: 'New Invoice',
    hideFromSidebar: true
  },
  {
    path: '/Sales/Invoice/Add',
    component: <NewInvoice />,
    label: 'New Invoice',
    hideFromSidebar: true
  },
  {
    path: '/sales/invoice/list',
    component: <SalesHistory />,
    hideFromSidebar: true
  },
  {
    path: '/Sales-Return/Debit-Notes/Add',
    component: <AddSalesReturn />,
    hideFromSidebar: true
  },
  {
    path: '/sales-return/debit-notes/add',
    component: <AddSalesReturn />,
    hideFromSidebar: true
  },
  {
    path: '/Sales-Return/Debit-Notes/Edit/:id',
    component: <AddSalesReturn />,
    hideFromSidebar: true
  },
  {
    path: '/sales-return/debit-notes/edit/:id',
    component: <AddSalesReturn />,
    hideFromSidebar: true
  },
  {
    path: '/Sales/Sales-Return/Add',
    component: <AddSalesReturn />,
    hideFromSidebar: true
  },
  {
    path: '/sales/sales-return/add',
    component: <AddSalesReturn />,
    hideFromSidebar: true
  },
  {
    path: '/Sales/Sales-Return/Edit/:id',
    component: <AddSalesReturn />,
    hideFromSidebar: true
  },
  {
    path: '/sales/sales-return/edit/:id',
    component: <AddSalesReturn />,
    hideFromSidebar: true
  },
  {
    path: '/Sales-Return/Debit-Notes/List',
    component: <SalesReturnList />,
    hideFromSidebar: true
  },
  {
    path: '/sales-return/debit-notes/list',
    component: <SalesReturnList />,
    hideFromSidebar: true
  },
  {
    path: '/Sales-Return/List',
    component: <SalesReturnList />,
    hideFromSidebar: true
  },
  {
    path: '/sales-return/list',
    component: <SalesReturnList />,
    hideFromSidebar: true
  },
  {
    path: '/Sales-Return/Add',
    component: <AddSalesReturn />,
    hideFromSidebar: true
  },
  {
    path: '/sales-return/add',
    component: <AddSalesReturn />,
    hideFromSidebar: true
  },
  {
    path: '/Sales-Return/Edit/:id',
    component: <AddSalesReturn />,
    hideFromSidebar: true
  },
  {
    path: '/sales-return/edit/:id',
    component: <AddSalesReturn />,
    hideFromSidebar: true
  },
  {
    path: '/Sales-Return/Print/:id',
    component: <PrintSalesReturn />,
    hideFromSidebar: true
  },
  {
    path: '/sales-return/print/:id',
    component: <PrintSalesReturn />,
    hideFromSidebar: true
  },
  {
    path: '/Registration/InvoiceReceipt/Add',
    component: <AddInvoiceReceipt />,
    hideFromSidebar: true
  },
  {
    path: '/Sales/InvoiceReceipt/Add',
    component: <AddInvoiceReceipt />,
    hideFromSidebar: true
  },
  {
    path: '/Registration/InvoiceReceipt/List',
    component: <InvoiceReceiptList />,
    hideFromSidebar: true
  },
  {
    path: '/Customers/customer-details',
    component: <AddCustomer />,
    hideFromSidebar: true
  },
  {
    path: '/Sales/Customers/Add',
    component: <AddCustomer />,
    hideFromSidebar: true
  },
  {
    path: '/Customers/list',
    component: <CustomerHistory />,
    hideFromSidebar: true
  },
  {
    path: '/Salesman/add',
    component: <AddSalesman />,
    hideFromSidebar: true
  },
  {
    path: '/Sales/Salesman/Add',
    component: <AddSalesman />,
    hideFromSidebar: true
  },
  {
    path: '/Salesman/list',
    component: <SalesmanHistory />,
    hideFromSidebar: true
  },
  {
    path: '/Delivery-Challan/Details',
    component: <AddDeliveryChallan />,
    hideFromSidebar: true
  },
  {
    path: '/Sales/Delivery-Challan/Add',
    component: <AddDeliveryChallan />,
    hideFromSidebar: true
  },
  {
    path: '/Delivery-Challan/List',
    component: <DeliveryChallanHistory />,
    hideFromSidebar: true
  },
  {
    path: '/Registration/MultiInvoiceReceipt/Add',
    component: <AddMultiInvoiceReceipt />,
    hideFromSidebar: true
  },
  {
    path: '/Sales/MultiInvoiceReceipt/Add',
    component: <AddMultiInvoiceReceipt />,
    hideFromSidebar: true
  },
  {
    path: '/Purchase/Purchases/Add',
    component: <AddPurchases />,
    hideFromSidebar: true
  },
  {
    path: '/Purchase/GRN/Add',
    component: <AddGRN />,
    hideFromSidebar: true
  },
  {
    path: '/Purchase/GRN/Edit/:id',
    component: <AddGRN />,
    hideFromSidebar: true
  },
  {
    path: '/Purchase/Inward-Challan/Verify/:id',
    component: <VerifyInward />,
    hideFromSidebar: true
  },
  {
    path: '/Warehouse/Return-Challan/Verify/:id',
    component: <VerifyReturnChallan />,
    hideFromSidebar: true
  },
  {
    path: '/Purchase/Purchases/Print/:id',
    component: <PrintPurchase />,
    label: 'Print Purchase',
    hideFromSidebar: true
  },
  {
    path: '/purchase/purchases/print/:id',
    component: <PrintPurchase />,
    label: 'Print Purchase',
    hideFromSidebar: true
  },
  {
    path: '/Purchase/Vendor/Add',
    component: <AddVendor />,
    hideFromSidebar: true
  },
  {
    path: '/Purchase/Purchase-Receipt/Add',
    component: <AddPurchaseReceipt />,
    hideFromSidebar: true
  },
  {
    path: '/Purchase/Purchase-Return/Add',
    component: <AddPurchaseReturn />,
    hideFromSidebar: true
  },
  {
    path: '/Purchase/Purchase-Return/Print/:id',
    component: <PrintPurchaseReturn />,
    label: 'Print Debit Note',
    hideFromSidebar: true
  },
  {
    path: '/purchase/purchase-return/print/:id',
    component: <PrintPurchaseReturn />,
    label: 'Print Debit Note',
    hideFromSidebar: true
  },
  {
    path: '/Purchase-Return/Debit-Notes/Print/:id',
    component: <PrintPurchaseReturn />,
    label: 'Print Debit Note',
    hideFromSidebar: true
  },
  {
    path: '/Purchase/Purchase-Return-Receipt/Add',
    component: <AddPurchaseReturnReceipt />,
    hideFromSidebar: true
  },
  {
    path: '/Purchase/Purchase-Return-Receipt/Print/:id',
    component: <PrintPurchaseReturnReceipt />,
    label: 'Print Return Receipt',
    hideFromSidebar: true
  },
  {
    path: '/purchase/purchase-return-receipt/print/:id',
    component: <PrintPurchaseReturnReceipt />,
    label: 'Print Return Receipt',
    hideFromSidebar: true
  },
  {
    path: '/Purchase-Return-Receipt/Print/:id',
    component: <PrintPurchaseReturnReceipt />,
    label: 'Print Return Receipt',
    hideFromSidebar: true
  },
  {
    path: '/Reports/Sales-Report/Print',
    component: <SaleReportPrint />,
    hideFromSidebar: true
  },
  {
    path: '/sales/sales-return-receipt/add',
    component: <SaleReturnReceiptAdd />,
    hideFromSidebar: true
  },
  {
    path: '/Sales/Sales-Return-Receipt/Add',
    component: <SaleReturnReceiptAdd />,
    hideFromSidebar: true
  },
  {
    path: '/sales/sales-return-receipt/list',
    component: <SaleReturnReceiptList />,
    hideFromSidebar: true
  },
  {
    path: '/Reports/Purchase-Report/Print',
    component: <PurchaseReportPrint />,
    hideFromSidebar: true
  },
  {
    path: '/Reports/Stock-Report/Print',
    component: <StockReportPrint />,
    hideFromSidebar: true
  },
  {
    path: '/Reports/Account-Report/Print',
    component: <AccountReportPrint />,
    hideFromSidebar: true
  },
  {
    path: '/Reports/Holding-Report/Print',
    component: <HoldingReportPrint />,
    hideFromSidebar: true
  },
  {
    path: '/Registration/InvoiceReceipt/Print/:id',
    component: <PrintInvoiceReceipt />,
    hideFromSidebar: true
  },
  {
    path: '/Sales/InvoiceReceipt/Print/:id',
    component: <PrintInvoiceReceipt />,
    hideFromSidebar: true
  },
  {
    path: '/Purchase/Purchase-Receipt/Print/:id',
    component: <PrintPurchaseReceipt />,
    hideFromSidebar: true
  },
  {
    path: '/purchase/purchase-receipt/print/:id',
    component: <PrintPurchaseReceipt />,
    hideFromSidebar: true
  },
  {
    path: '/Sales/Sales-Return-Receipt/Print/:id',
    component: <PrintSalesReturnReceipt />,
    label: 'Print Sales Return Receipt',
    hideFromSidebar: true
  },
  {
    path: '/sales/sales-return-receipt/print/:id',
    component: <PrintSalesReturnReceipt />,
    label: 'Print Sales Return Receipt',
    hideFromSidebar: true
  },
  {
    path: '/Sales-Return-Receipt/Print/:id',
    component: <PrintSalesReturnReceipt />,
    label: 'Print Sales Return Receipt',
    hideFromSidebar: true
  }
];
