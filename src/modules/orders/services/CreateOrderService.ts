import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Customer from '@modules/customers/infra/typeorm/entities/Customer';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';
import Product from '../../products/infra/typeorm/entities/Product';

interface IProduct {
  id: string;
  quantity: number;
}

interface IProductQuantity {
  [id: string]: number;
}

interface IDBProducts {
  [id: string]: Product;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,

    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,

    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customer = await this.getCustomer(customer_id);

    const productsFromDB = await this.findProducts(products);

    this.validate(products, productsFromDB);

    const order = await this.createOrder(customer, products, productsFromDB);

    await this.substractQuantitiesFromProducts(products, productsFromDB);

    return order;
  }

  private async getCustomer(customer_id: string): Promise<Customer> {
    const customer = await this.customersRepository.findById(customer_id);

    if (!customer) {
      throw new AppError('This customer does not exist');
    }

    return customer;
  }

  private async createOrder(
    customer: Customer,
    products: IProduct[],
    productsFromDB: IDBProducts,
  ): Promise<Order> {
    const orderProducts = products.map(product => {
      const { id: product_id, quantity } = product;
      const { price } = productsFromDB[product_id];

      return {
        product_id,
        quantity,
        price,
      };
    });

    return this.ordersRepository.create({
      customer,
      products: orderProducts,
    });
  }

  private async substractQuantitiesFromProducts(
    products: IProduct[],
    productsFromDB: IDBProducts,
  ): Promise<void> {
    const productsToUpdate = products.map(product => {
      return {
        id: product.id,
        quantity: productsFromDB[product.id].quantity - product.quantity,
      };
    });

    await this.productsRepository.updateQuantity(productsToUpdate);
  }

  private async findProducts(products: IProduct[]): Promise<IDBProducts> {
    const productsFromDB = await this.productsRepository.findAllById(products);

    const productsMap = productsFromDB.reduce((prev, curr) => {
      const product = prev;
      product[curr.id] = curr;
      return prev;
    }, {} as IDBProducts);

    return productsMap;
  }

  private validate(orderProducts: IProduct[], dbProducts: IDBProducts): void {
    orderProducts.forEach(orderProduct => {
      const dbProduct = dbProducts[orderProduct.id];

      if (!dbProduct) {
        throw new AppError(`Product ${orderProduct.id} does not exist`);
      }

      if (orderProduct.quantity > dbProduct.quantity) {
        throw new AppError(
          `There is only ${dbProduct.quantity} units of product ${dbProduct.name} available`,
        );
      }
    });
  }
}

export default CreateOrderService;
